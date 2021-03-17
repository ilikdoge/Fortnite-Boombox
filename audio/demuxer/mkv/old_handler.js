"use-strict";

const util = require('./util');
const parser = require('./parser');
const SampleProvider = require('./sample_provider');

const ERR_TRACK_NOT_IN_CUE = "track not in cue";
const ERR_UNEXPECTED_READ_END = "unexpected read end";
const ERR_BAD_CLUSTER = "cluster is missing critical elements";

class MKVDataHandler{
	constructor(file, track, info, cues){
		track.timescale = 1E9 / info.timescale;

		this._events = {};

		this.file = file;
		this.track = track;
		this.info = info;
		this.cues = cues;
		this.clusters = [];
		this.next_cluster_start = info.first_cluster_offset;

		if(info.duration)
			this.duration = info.duration;
		else if(cues)
			this.duration = this.cues[this.cues.length - 1].cue_time; /* minimum duration */
		else
			this.duration = 0;
		if(cues){
			for(var i = 0; i < cues.length; i++)
				if(!cues[i].cue_track_positions[this.track.number])
					return process.nextTick(() => {
						this.emit('error', ERR_TRACK_NOT_IN_CUE);
					});
		}else
			this.fetchClusters();
	}

	readElement(sreader, cb){
		var pos = sreader.position;

		util.async.readVint(sreader, false, (id, id_read) => {
			if(id === null)
				cb(null);
			else
				util.async.readVint(sreader, false, (size, size_read) => {
					if(size === null)
						cb(null);
					else
						cb({id, size, range: [pos, pos + id_read + size_read + size]});
				});
		});
	}

	processNextCluster(sreader, cb){
		var cur = this.next_cluster_start;
		var destroy_reader = sreader ? false : true;

		if(sreader)
			sreader.seek(cur);
		else
			sreader = this.file.read(cur);
		var aborted = false;
		var processing = {
			abort(){
				aborted = true;
				sreader.destroy();
			}
		};

		this.readElement(sreader, (el) => {
			if(aborted)
				return;
			if(el){
				if(el.id != util.MatroskaID.Cluster)
					return cb(null, null);
				else{
					this.next_cluster_start = el.range[1];

					sreader.read(el.size, (reader) => {
						if(aborted)
							return;
						if(reader){
							var cluster = parser.parseCluster(reader);

							if(cluster.timecode === null)
								return cb(ERR_BAD_CLUSTER);
							var provider = new SampleProvider();

							for(var i = 0; i < cluster.blocks.length; i++){
								var reader = cluster.blocks[i];
								var trackNumber = util.sync.readVint(reader);

								if(trackNumber == this.track.number){
									reader.reset();
									provider.add(parser.parseBlock(reader));
								}
							}

							this.storeCluster({byte_start: cur, timecode: cluster.timecode, next_cluster_start: el.range[1], duration: provider.duration});

							if(cluster.duration > provider.duration)
								provider.duration = cluster.duration;
							else if(this.track.default_duration)
								provider.duration += this.track.default_duration * this.track.timescale;

							/* duration is guessed because it's not provided in the blocks */

							cb(null, {time_offset: cluster.timecode, samples: provider}, true);

							if(destroy_reader)
								sreader.destroy();
						}else
							cb(ERR_UNEXPECTED_READ_END, null);
					});
				}
			}else
				cb(null, null);
		});

		return processing;
	}

	process(cb, min_duration = 0){
		min_duration *= this.track.timescale;

		var sreader = this.file.read(this.next_cluster_start);
		var aborted = false;
		var processing = {
			abort(){
				aborted = true;
				sreader.destroy();
			}
		};

		var proc = () => {
			this.processNextCluster(sreader, (err, data) => {
				if(aborted)
					return;
				if(err)
					return cb(err, null);
				if(!data)
					return cb(null, null);
				min_duration -= data.samples.duration;

				var next = min_duration > 0;

				cb(null, data, !next);

				if(next)
					proc();
				else
					sreader.destroy();
			});
		};

		proc();

		return processing;
	}

	processNext(min_duration, cb){
		return this.process(cb, min_duration);
	}

	seek(time){
		time *= this.track.timescale;

		if(this.cues){
			var l = 0;
			var r = this.cues.length - 1;

			while(l < r){
				var mid = Math.floor((l + r + 1) / 2);

				if(this.cues[mid].cue_time > time)
					r = mid - 1;
				else
					l = mid;
			}

			this.next_cluster_start = this.cues[l].cue_track_positions[this.track.number] + this.info.segment_byte_offset;
		}else{
			var l = -1;
			var r = this.clusters.length - 1;

			while(l < r){
				var mid = Math.floor((l + r + 1) / 2);

				if(this.clusters[mid].timecode > time)
					r = mid - 1;
				else
					l = mid;
			}

			if(l == -1)
				this.next_cluster_start = this.info.first_cluster_offset;
			else
				this.next_cluster_start = this.clusters[l].byte_start;
		}

		this.seeking_to = time;
	}

	binarySearchCluster(cluster){
		var l = -1;
		var r = this.clusters.length - 1;

		while(l < r){
			var mid = Math.floor((l + r + 1) / 2);

			if(this.clusters[mid].byte_start <= cluster.byte_start)
				l = mid;
			else
				r = mid - 1;
		}

		return l;
	}

	storeCluster(cluster){
		var ind = this.binarySearchCluster(cluster);

		if(ind == -1)
			this.clusters.splice(0, 0, cluster);
		else if(this.clusters[ind].byte_start != cluster.byte_start)
			this.clusters.splice(ind + 1, 0, cluster);
		var next = this.clusters[ind + 1];

		if(next && cluster.next_cluster_start == next.byte_start)
			cluster.duration = next.timecode - cluster.timecode;
	}

	fetchClusters(){

	}

	on(name, cb){
		if(this._events[name])
			this._events[name].push(cb);
		else
			this._events[name] = [cb];
	}

	emit(name, ...args){
		var evt = this._events[name];

		if(evt)
			for(var i = 0; i < evt.length; i++)
				evt[i].apply(this, args);
		else if(name == 'error')
			throw args[0];
	}

	destroy(){

	}

	/*
	processCue(index, cb){
		var cue = this.cues[index];
		var start = cue.cue_track_positions[this.track.number];

		if(!start){
			cb(ERR_TRACK_NOT_IN_CUE, null);

			return null;
		}

		var end = null;

		if(index + 1 < this.cues.length){
			var nextCue = this.cues[index + 1];

			end = nextCue.cue_track_positions[this.track.number];

			if(!end){
				cb(ERR_TRACK_NOT_IN_CUE, null);

				return null;
			}
		}

		var sreader = this.file.read(start, end);
		var aborted = false;
		var processing = {
			abort(){
				aborted = true;
				sreader.destroy();
			}
		};

		var proc = () => {
			util.async.asyncReadVint(sreader, (id) => {

			});
		};
	}

	process(index, cb){
		if(this.clusters && this.clusters[index])
			return this.processCluster(index, cb);
		else
			return this.processCue(index, cb);
	}*/
}

module.exports = MKVDataHandler;