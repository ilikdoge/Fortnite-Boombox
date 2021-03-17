"use-strict";

const EventEmitter = require('../../util/EventEmitter');

const util = require('./util');
const parser = require('./parser');
const SampleProvider = require('./sample');

const Errors = require('../../error');

class MKVDataHandler extends EventEmitter{
	constructor(file, track, info, cues){
		super();

		track.timescale = 1E9 / info.timescale;

		this.file = file;
		this.track = track;
		this.info = info;
		this.clusters = [];
		this.next_cluster_start = info.first_cluster_offset;

		if(info.duration)
			this.duration = info.duration;
		else if(cues)
			this.duration = this.cues[this.cues.length - 1].cue_time; /* minimum duration */
		else
			this.duration = 0;
		if(cues){
			var time = new BigUint64Array(cues.length);
			var pos = new BigUint64Array(cues.length);

			this.cues = {time, pos, length: cues.length};

			for(var i = 0; i < cues.length; i++){
				time[i] = BigInt(cues[i].cue_time);

				for(var j in cues[i].cue_track_positions){
					pos[i] = BigInt(cues[i].cue_track_positions[j]);

					break;
				}
			}
		}else
			process.nextTick(() => {
				this.fetchClusters();
			});
	}

	readElement(sreader, cb){
		var pos = sreader.position;

		util.async.readVint(sreader, false, (err, id, id_read) => {
			if(err)
				return cb(err);
			if(id === null)
				cb(null, null);
			else
				util.async.readVint(sreader, false, (err, size, size_read) => {
					if(err)
						return cb(err);
					if(size === null)
						cb(null, null);
					else
						cb(null, {id, size, range: [pos, pos + id_read + size_read + size]});
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
		this.readElement(sreader, (err, el) => {
			if(err)
				return cb(err, null);
			if(el){
				if(el.id != util.MatroskaID.Cluster)
					return cb(null, null);
				else{
					this.next_cluster_start = el.range[1];

					sreader.read(el.size, (err, reader) => {
						if(err)
							return cb(err);
						if(reader){
							var cluster = parser.parseCluster(reader);

							if(cluster.timecode === null)
								return cb(new Error(Errors.BAD_CLUSTER));
							var provider = new SampleProvider();

							for(var i = 0; i < cluster.blocks.length; i++){
								var reader = cluster.blocks[i];
								var trackNumber = util.sync.readVint(reader);

								if(trackNumber == this.track.number){
									reader.reset();
									provider.add(parser.parseBlock(reader));
								}
							}

							this.storeCluster({byte_start: cur, timecode: BigInt(cluster.timecode), next_cluster_start: el.range[1]});

							if(cluster.duration)
								provider.duration = cluster.duration;
							else if(this.track.default_duration)
								provider.duration += this.track.default_duration * this.track.timescale;

							/* duration is guessed because it's not provided */

							cb(null, {time_offset: cluster.timecode, samples: provider}, true);

							if(destroy_reader)
								sreader.destroy();
						}else
							cb(new Error(Errors.UNEXPECTED_READ_END), null);
					});
				}
			}else
				cb(null, null);
		});

		return {
			abort(){
				sreader.destroy();
			}
		};
	}

	process(cb, min_duration = 0){
		min_duration *= this.track.timescale;

		var sreader = this.file.read(this.next_cluster_start);

		var proc = () => {
			this.processNextCluster(sreader, (err, data) => {
				if(err || !data){
					sreader.destroy();

					return cb(err, null);
				}

				if(this.seeking_to && data.time_offset + data.samples.duration < this.seeking_to)
					return proc();
				else
					this.seeking_to = null;
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

		return {
			abort(){
				sreader.destroy();
			}
		};
	}

	processNext(min_duration, cb){
		return this.process(cb, min_duration);
	}

	seek(time){
		time = BigInt(Math.round(time * this.track.timescale));

		if(this.cues){
			var l = 0;
			var r = this.cues.length - 1;
			var times = this.cues.time;

			while(l < r){
				var mid = Math.floor((l + r + 1) / 2);

				if(times[mid] > time)
					r = mid - 1;
				else
					l = mid;
			}

			this.next_cluster_start = Number(this.cues.pos[l]) + this.info.segment_byte_offset;
		}else{
			if(this.cluster_fetching){
				var last_cluster = this.clusters[this.clusters.length - 1];

				if(!last_cluster || (time >= last_cluster.timecode + (last_cluster.duration || 0)))
					return Errors.SEEK_INFO_LOADING;
			}

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
		var cur = this.info.first_cluster_offset;
		var sreader = this.file.read(cur);

		this.cluster_fetching = {
			abort(){
				sreader.destroy();
			}
		};

		var error = (err) => {
			sreader.destroy();

			this.cluster_fetching = null;
			this.emit('error', err);
		}

		var proc = () => {
			this.readElement(sreader, (err, el) => {
				if(err)
					return error(err);
				if(el){
					if(el.id != util.MatroskaID.Cluster)
						return this.cluster_fetching = null;
					else{
						cur = el.range[1];

						sreader.read(el.size, (err, reader) => {
							if(err)
								return error(err);
							if(reader){
								var cluster = parser.parseCluster(reader);

								if(cluster.timecode === null)
									return error(new Error(Errors.BAD_CLUSTER));
								this.storeCluster({byte_start: cur, timecode: BigInt(cluster.timecode), next_cluster_start: el.range[1]});

								if(!this.info.duration){
									var timecode = 0;

									for(var i = cluster.blocks.length - 1; i >= 0; i--){
										var reader = cluster.blocks[i];
										var trackNumber = util.sync.readVint(reader);

										if(trackNumber == this.track.number){
											timecode = reader.readInt16();

											break;
										}
									}

									this.duration = cluster.timecode + timecode;
								}

								sreader.destroy();						/* for youtube streams */
								sreader = this.file.read(el.range[1]);	/* they slow down after downloading data for a while */

								proc();
							}else
								error(new Error(Errors.UNEXPECTED_READ_END));
						});
					}
				}else
					this.cluster_fetching = null;
			});
		};

		proc();
	}

	destroy(){
		if(this.cluster_fetching)
			this.cluster_fetching.abort();
	}
}

module.exports = MKVDataHandler;