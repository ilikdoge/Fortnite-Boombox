'use-strict';

const EventEmitter = require('../../util/EventEmitter');

const SampleProvider = require('./sample');

const Errors = require('../../error');

class ISOMStandardDataHandler extends EventEmitter{
	constructor(file, track){
		super();

		this.file = file;
		this.track = track;
		this.chunk = 0;

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

		this.chunkOffset = chunkOffset;
		this.chunkSamples = chunkSamples;
		this.chunkTime = chunkTime;

		if(!chunkOffset.length || !chunkSamples.length || !chunkTime.length)
			process.nextTick(() => {
				this.emit('error', new Error(Errors.TRACK_SAMPLE_DATA_UNKNOWN));
			});
		this.length = chunkOffset.length;
		this.duration = chunkTime[this.length];
	}

	processInternal(chunk, end, sreader, cb){
		var samples = this.chunkSamples[chunk];
		var time = this.chunkTime[chunk];

		sreader.seek(this.chunkOffset[chunk]);
		sreader.read(samples.size.total, (err, reader) => {
			if(err)
				return cb(err, null);
			if(reader){
				var next = chunk++ < end;

				this.chunk = chunk;

				cb(null, {time_offset: time, samples: new SampleProvider(reader.read(samples.size.total), samples)}, !next);

				if(next)
					this.processInternal(chunk, end, sreader, cb);
				else
					sreader.destroy();
			}else
				cb(new Error(Errors.UNEXPECTED_READ_END));
		});
	}

	process(chunk, cb, min_duration = 0){
		var begin = this.chunkOffset[chunk];
		var time = this.chunkTime[chunk];
		var end = chunk;

		min_duration *= this.track.sample_rate;

		while(end + 1 < this.length && this.chunkTime[end + 1] - time < min_duration)
			end++;
		var sreader = this.file.read(begin, this.chunkOffset[end] + this.chunkSamples[end].size.total - 1);

		this.processInternal(chunk, end, sreader, (err, data, done) => {
			cb(err, data, done);
		});

		return {
			abort(){
				sreader.destroy();
			}
		};
	}

	processNext(min_duration, cb){
		if(this.chunk >= this.length)
			return cb(null, null);
		return this.process(this.chunk, cb, min_duration);
	}

	seek(time){
		time *= this.track.timescale;

		var l = 0;
		var r = this.chunkTime.length - 1;

		while(l < r){
			var mid = Math.floor((l + r + 1) / 2);

			if(this.chunkTime[mid] > time)
				r = mid - 1;
			else
				l = mid;
		}

		this.chunk = l;
	}

	destroy(){}
}

module.exports = ISOMStandardDataHandler;