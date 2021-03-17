"use-strict";

const util = require('./util');
const parser = require('./parser');

const ERR_TRACK_NOT_IN_CUE = "track not in cue";

class MKVDataHandler{
	constructor(file, track, info, cues, clusters){
		track.timescale = 1E9 / (track.timecode_scale ? track.timecode_scale : info.timescale);

		this.file = file;
		this.track = track;
		this.info = info;
		this.cues = cues;
		this.clusters = clusters;
		this.next_cluster_start = info.first_cluster_offset;

		if(info.duration)
			this.duration = info.duration * info.timescale / 1E9;
		else if(cues){
			//duration
		}

		if(!cues)
			this.fetchClusters();
	}

	processNextCluster(){
		var sreader = this.file.read(this.next_cluster_start);
		var aborted = false;
		var processing = {
			abort(){
				aborted = true;
				sreader.destroy();
			}
		};
	}

	processNext(min_duration, cb){

	}

	seek(time){

	}

	fetchClusters(){

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