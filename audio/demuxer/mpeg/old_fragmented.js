'use-strict';

const parser = require('./parser');

const ERR_UNEXPECTED_FIRST_BOX = "unexpected first box";
const ERR_TRACK_NOT_IN_MOOF = "track not in moof";
const ERR_TRACK_SAMPLE_SIZE_UNKNOWN = "track sample size unknown";
const ERR_UNEXPECTED_READ_END = "unexpected read end";
const ERR_TRACK_SEEK_INFO_LOADING = "track seek info loading";

class MpegFragmentedDataHandler{
	constructor(file, track, sidx, moofs){
		this.file = file;
		this.track = track;
		this.sidx = sidx;
		this.moofs = moofs || [];

		if(sidx)
			this.duration = sidx.time.start[sidx.length - 1] + sidx.time.length[sidx.length - 1];
		else if(moofs && !moofs.finished){//rewrite

			var lmt = moofs[moofs.length - 1][this.track.id];

			if(lmt)
				this.duration = lmt.base_media_decode_time + (lmt.samples.duration.total || this.track.default_sample_duration * lmt.samples.sample_count);
			else{
				this.process = function(chunk, cb){
					cb(ERR_TRACK_NOT_IN_MOOF, null);
				};

				return;
			}

			var push = moofs.push;

			moofs.push = (moof) => {
				push.apply(moofs, [moof]);

				var track = moof[this.track.id];

				if(track)
					this.duration = track.base_media_decode_time + (track.samples.duration.total || this.track.default_sample_duration * track.samples.sample_count);
				else{
					this.process = function(chunk, cb){
						cb(ERR_TRACK_NOT_IN_MOOF, null);
					};

					moof.push = push;
				}
			};
		}
	}

	processSegment(seg, cb, min_duration = 0){
		var start = this.sidx.byte.start[seg];
		var timestart = this.sidx.time.start[seg];
		var endseg = seg;

		while(endseg + 1 < this.sidx.length && this.sidx.time.start[endseg + 1] - timestart < min_duration)
			endseg++;
		var end = this.sidx.byte.end[endseg];
		var sreader = this.file.read(start, end);
		var aborted = false;
		var processing = {
			abort(){
				aborted = true;
				sreader.destroy();
			}
		};

		var proc = () => {
			sreader.seek(this.sidx.byte.start[seg]);
			sreader.read(8, (reader) => {
				if(aborted)
					return;
				if(!reader)
					return cb(ERR_UNEXPECTED_READ_END, null);
				var size = reader.readUint32();
				var type = reader.readString(4);
				var begin = reader.range.begin;

				if(size == 0 || type != 'moof')
					return cb(ERR_UNEXPECTED_FIRST_BOX, null);
				sreader.read(size - 8, (reader) => {
					if(!reader){
						if(!aborted)
							cb(ERR_UNEXPECTED_READ_END, null);
						return;
					}

					var moof = parser.parseMovieFragmentBox(reader);

					moof.begin = begin;
					moof.end = reader.range.end;
					moof.data_end = end;

					this.moofs[seg] = moof;

					if(aborted)
						return;
					this.processMoof(sreader, moof, (err, data) => {
						if(aborted)
							return;
						var next = seg++ < endseg;

						cb(err, data, !next);

						if(!err && next)
							proc();
						else
							sreader.destroy();
					});
				});
			});
		};

		proc();

		return processing;
	}

	processMoof(sreader, moof, cb){
		var track = moof[this.track.id];

		if(!track){
			cb(ERR_TRACK_NOT_IN_MOOF, null);

			return null;
		}

		var start = moof.begin + track.data_offset;
		var size = null;

		if(track.samples.size.total)
			size = track.samples.size.total;
		else if(this.track.default_sample_size){
			track.samples.size.default = this.track.default_sample_size;
			size = track.samples.size.total = this.track.default_sample_size * track.samples.sample_count;
		}else{
			cb(ERR_TRACK_SAMPLE_SIZE_UNKNOWN, null);

			return null;
		}

		var destroy_reader = sreader ? false : true;

		if(sreader)
			sreader.seek(start);
		else
			sreader = this.file.read(start, start + size - 1);
		var aborted = false;
		var processing = {
			abort(){
				aborted = true;
				sreader.destroy();
			}
		};

		sreader.read(size, (reader) => {
			if(aborted)
				return;
			if(reader){
				if(!track.samples.duration.total && this.track.default_sample_duration){
					track.samples.duration.default = this.track.default_sample_duration;
					track.samples.duration.total = this.track.default_sample_duration * track.samples.sample_count;
				}

				cb(null, {data: reader.read(size), time_offset: track.base_media_decode_time, samples: track.samples}, true);
			}else
				cb(ERR_UNEXPECTED_READ_END, null);
			if(destroy_reader)
				sreader.destroy();
		});

		return processing;
	}

	processMoofs(start, end, cb){
		var moof = this.moofs[start];
		var bytestart = moof.begin + moof[this.track.id].data_offset;

		moof = this.moofs[end];

		var track = moof[this.track.id];
		var size = null;

		if(track.samples.size.total)
			size = track.samples.size.total;
		else if(this.track.default_sample_size){
			track.samples.size.default = this.track.default_sample_size;
			size = track.samples.size.total = this.track.default_sample_size * track.samples.sample_count;
		}else{
			cb(ERR_TRACK_SAMPLE_SIZE_UNKNOWN, null);

			return null;
		}

		var sreader = this.file.read(bytestart, moof.begin + track.data_offset + size - 1);
		var aborted = false;
		var processing = {
			abort(){
				aborted = true;
				sreader.destroy();
			}
		};

		var proc = () => {
			this.processMoof(sreader, this.moofs[start], (err, data) => {
				if(aborted)
					return;
				var next = start++ < end;

				cb(err, data, !next);

				if(!err && next)
					proc();
				else
					sreader.destroy();
			});
		};

		proc();

		return processing;
	}

	process(index, cb, min_duration = 0){
		var end = index;

		if(this.sidx){
			var start = this.sidx.time.start[index];

			while(end + 1 < this.sidx.length && this.sidx.time.start[end + 1] - start < min_duration)
				end++;
		}else{
			var start = this.moofs[index][this.track.id].base_media_decode_time;

			while(end + 1 < this.moofs.length && this.moofs[end + 1][this.track.id].base_media_decode_time - start < min_duration)
				end++;
		}

		var has = true;

		for(var i = index; i <= end; i++)
			if(!this.moofs[i]){
				has = false;

				break;
			}
		if(has)
			return this.processMoofs(index, end, cb);
		else
			return this.processSegment(index, cb, min_duration);
	}

	timeToSegment(time){
		if(this.sidx){
			time = time * this.sidx.timescale;

			var l = 0;
			var r = this.sidx.length;
			var starts = this.sidx.time.start;

			while(l < r){
				var mid = Math.floor((l + r + 1) / 2);

				if(starts[mid] > time)
					r = mid - 1;
				else
					l = mid;
			}

			return [null, l];
		}else{
			time = time * this.track.timescale;

			var id = this.track.id;
			var l = 0;
			var r = this.moofs.length;

			while(l < r){
				var mid = Math.floor((l + r + 1) / 2);
				var moof = this.moofs[mid];

				if(moof){
					if(moof[id]){
						if(moof[id].base_media_decode_time > time)
							r = mid - 1;
						else
							l = mid;
					}else
						return [ERR_TRACK_NOT_IN_MOOF, null];
				}else if(!this.moofs.finished)
					return [ERR_TRACK_SEEK_INFO_LOADING, null];
			}

			return [null, l];
		}
	}

	segmentToTime(seg){
		if(this.sidx)
			return this.sidx.time.start[seg];
		return this.moofs[seg][this.track.id].base_media_decode_time;
	}

	get length(){
		if(this.sidx)
			return this.sidx.length;
		return this.moofs.length;
	}
}

MpegFragmentedDataHandler.ERR_TRACK_NOT_IN_MOOF = ERR_TRACK_NOT_IN_MOOF;
MpegFragmentedDataHandler.ERR_TRACK_SAMPLE_SIZE_UNKNOWN = ERR_TRACK_SAMPLE_SIZE_UNKNOWN;
MpegFragmentedDataHandler.ERR_TRACK_SEEK_INFO_LOADING = ERR_TRACK_SEEK_INFO_LOADING;
MpegFragmentedDataHandler.ERR_UNEXPECTED_FIRST_BOX = ERR_UNEXPECTED_FIRST_BOX;
MpegFragmentedDataHandler.ERR_UNEXPECTED_READ_END = ERR_UNEXPECTED_READ_END;

module.exports = MpegFragmentedDataHandler;