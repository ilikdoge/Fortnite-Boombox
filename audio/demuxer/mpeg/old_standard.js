'use-strict';

const ERR_UNEXPECTED_READ_END = "unexpected read end";
const ERR_NO_SAMPLE_INFO = "no sample info";

class MpegStandardDataHandler{
	constructor(file, track){
		this.file = file;
		this.track = track;

		var table = track.sampleTable;

		var chunkOffset = table.chunkOffset;
		var sampleChunk = table.sampleChunk;
		var sampleTime = table.sampleTime;
		var sz = table.sampleSize;

		track.sampleTable = null;

		var sampleSize = sz.sample_size;
		var size_entries = sz.entries;

		var chunkIndex = 0;
		var sampleChunkIndex = 0;
		var chunkSampleCount = sampleChunk.samples_per_chunk[0];
		var chunkNextFirst = sampleChunk.length == 1 ? 0 : sampleChunk.first_chunk[1];

		var sampleSizeIndex = 0;

		var sampleTimeIndex = 0;
		var sampleTimeLeft = sampleTime.sample_count[0];
		var sampleTimeDelta = sampleTime.sample_delta[0];

		var timeOffset = 0;

		var chunkTime = new Uint32Array(chunkOffset.length + 1);
		var chunkSamples = new Array(chunkOffset.length);

		chunkTime[0] = 0;

		while(chunkIndex < chunkOffset.length){
			if(sampleChunkIndex + 1 < sampleChunk.entry_count && chunkIndex + 1 >= chunkNextFirst){
				sampleChunkIndex++;
				chunkSampleCount = sampleChunk.samples_per_chunk[sampleChunkIndex];
				chunkNextFirst = sampleChunkIndex + 1 >= sampleChunk.entry_count ? 0 : sampleChunk.first_chunk[sampleChunkIndex + 1];
			}

			var sizes = {total: sampleSize * chunkSampleCount, default: sampleSize};

			if(sampleSize == 0){
				var total = 0;
				var ent = new Uint32Array(chunkSampleCount);

				for(var i = 0; i < chunkSampleCount; i++){
					var size = size_entries[sampleSizeIndex++];

					total += size;
					ent[i] = size;
				}

				sizes.total = total;
				sizes.entries = ent;
			}

			var dur = 0;
			var duration = {total: 0};

			if(sampleTimeLeft >= chunkSampleCount){
				duration.default = sampleTime.sample_delta[sampleTimeIndex];
				duration.total = duration.default * chunkSampleCount;
				sampleTimeLeft -= chunkSampleCount;
				dur = duration.total;
			}else{
				var entries = new Uint32Array(chunkSampleCount);

				for(var i = 0; i < chunkSampleCount; i++){
					if(sampleTimeLeft <= 0){
						sampleTimeIndex++;
						sampleTimeLeft = sampleTime.sample_count[sampleTimeIndex];
						sampleTimeDelta = sampleTime.sample_delta[sampleTimeIndex];
					}

					entries[i] = sampleTimeDelta;
					dur += sampleTimeDelta;
					sampleTimeLeft--;
				}

				duration.total = dur;
				duration.default = 0;
				duration.entries = entries;
			}

			timeOffset += dur;

			chunkSamples[chunkIndex] = {duration, size: sizes, sample_count: chunkSampleCount};
			chunkTime[chunkIndex + 1] = timeOffset;
			chunkIndex++;
		}

		track.chunkOffset = chunkOffset;
		track.chunkSamples = chunkSamples;
		track.chunkTime = chunkTime;

		if(!chunkOffset.length || !chunkSamples.length || !chunkTime.length)
			this.process = function(chunk, cb){
				cb(ERR_NO_SAMPLE_INFO, null);
			};
		this.length = chunkOffset.length;
		this.duration = chunkTime[this.length];
	}

	process(chunk, cb, min_duration = 0){
		var begin = this.track.chunkOffset[chunk];
		var time = this.track.chunkTime[chunk];
		var size = this.track.chunkSamples[chunk].size.total;
		var end = chunk;
		var aborted = false;

		while(end + 1 < this.length && this.track.chunkTime[end + 1] - time < min_duration)
			size += this.track.chunkSamples[++end].size.total;
		var sreader = this.file.read(begin, this.track.chunkOffset[end] + this.track.chunkSamples[end].size.total - 1);
		var processing = {
			abort: function(){
				aborted = true;
				sreader.destroy();
			}
		};

		var proc = () => {
			var samples = this.track.chunkSamples[chunk];
			var time = this.track.chunkTime[chunk];

			sreader.seek(this.track.chunkOffset[chunk]);
			sreader.read(samples.size.total, (reader) => {
				if(aborted)
					return;
				if(reader){
					var next = chunk++ < end;

					cb(null, {data: reader.read(samples.size.total), time_offset: time, samples}, !next);

					if(next)
						proc();
				}else
					cb(ERR_UNEXPECTED_READ_END, null);
			});
		};

		proc();

		return processing;
	}

	timeToSegment(time){
		time *= this.track.timescale;

		var chunkTime = this.track.chunkTime;
		var l = 0;
		var r = chunkTime.length;

		while(l < r){
			var mid = Math.floor((l + r + 1) / 2);

			if(chunkTime[mid] > time)
				r = mid - 1;
			else
				l = mid;
		}

		return [null, l];
	}

	segmentToTime(seg){
		return this.track.chunkTime[seg];
	}
}

MpegStandardDataHandler.ERR_NO_SAMPLE_INFO = ERR_NO_SAMPLE_INFO;
MpegStandardDataHandler.ERR_UNEXPECTED_READ_END = ERR_UNEXPECTED_READ_END;

module.exports = MpegStandardDataHandler;