'use-strict';

const parser = require('./parser');
const SampleProvider = require('./sample_provider');

const ERR_TRACK_NOT_IN_MOOF = "track not in moof";
const ERR_UNEXPECTED_READ_END = "unexpected read end";
const ERR_TRACK_SEEK_INFO_LOADING = "track seek info loading";
const ERR_UNEXPECTED_BOX = "unexpected box when parsing mp4 data";
const ERR_TRACK_SAMPLE_SIZE_UNKNOWN = "track sample size unknown";

class MpegFragmentedDataHandler{
	constructor(file, track, sidx, moofs){
		this._events = {};

		this.file = file;
		this.track = track;
		this.sidx = sidx;
		this.moofs = moofs || [];
		this.chunk = 0;

		if(track.duration > 0)
			this.duration = track.duration;
		else if(sidx)
			this.duration = (sidx.time.start[sidx.length - 1] + sidx.time.length[sidx.length - 1]) * track.timescale / sidx.timescale;
		if(moofs){
			var moof = moofs[0][this.track.id];

			if(moof){
				moof.begin = moofs[0].begin;
				moof.end = moofs[0].end;
				moof.data_end = moofs[0].data_end;

				var err = this.handleMoof(moof);

				if(err){
					process.nextTick(() => {
						this.emit('error', new Error(err));
					});

					this.moofs.shift();

					return;
				}else{
					this.moofs[0] = moof;

					if(!this.duration)
						this.duration = moof.samples.duration.total;
				}
			}else{
				process.nextTick(() => {
					this.emit('error', new Error(ERR_TRACK_NOT_IN_MOOF));
				});

				this.moofs.shift();

				return;
			}
		}

		if(!sidx)
			this.fetchMoofs();
	}

	processSegment(seg, cb, min_duration = 0){
		min_duration = min_duration * this.sidx.timescale;

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
			var begin = this.sidx.byte.start[seg];

			sreader.seek(begin);
			sreader.read(8, (reader) => {
				if(aborted)
					return;
				if(!reader)
					return cb(new Error(ERR_UNEXPECTED_READ_END), null);
				var size = reader.readUint32();
				var type = reader.readString(4);

				if(size == 0 || type != 'moof')
					return cb(new Error(ERR_UNEXPECTED_BOX), null);
				sreader.read(size - 8, (reader) => {
					if(!reader){
						if(!aborted)
							cb(new Error(ERR_UNEXPECTED_READ_END), null);
						return;
					}

					var moof = parser.parseMovieFragmentBox(reader)[this.track.id];

					if(!moof)
						return cb(new Error(ERR_TRACK_NOT_IN_MOOF), null);
					var err = this.handleMoof(moof);

					if(err)
						return cb(err, null);
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

						this.chunk = seg;

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
		var start = moof.begin + moof.data_offset;
		var size = moof.samples.size.total;

		var destroy_reader = true;

		if(sreader){
			sreader.seek(start);
			destroy_reader = false;
		}else
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
			if(reader)
				cb(null, {time_offset: moof.base_media_decode_time, samples: new SampleProvider(reader.read(size), moof.samples)}, true);
			else
				cb(new Error(ERR_UNEXPECTED_READ_END), null);
			if(destroy_reader)
				sreader.destroy();
		});

		return processing;
	}

	processMoofs(start, end, cb){
		var moof = this.moofs[start];
		var bytestart = moof.begin + moof.data_offset;

		moof = this.moofs[end];

		var sreader = this.file.read(bytestart, moof.begin + moof.data_offset + moof.samples.size.total - 1);
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

				this.chunk = start;

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

	fetchAndProcess(byte_start, cb){
		var len = this.moofs.length;
		var chunk = this.chunk;

		var aborted = false;
		var sreader = this.file.read(byte_start);

		var processing = {
			abort(){
				aborted = true;
				sreader.destroy();
			}
		};

		var error = (err) => {
			sreader.destroy();

			cb(new Error(err), null);
		};

		sreader.read(8, (reader) => {
			if(aborted)
				return;
			if(!reader)
				return cb(null, null);
			var size = reader.readUint32();
			var type = reader.readString(4);

			if(type != 'moof' || size == 0)
				return cb(null, null);
			var begin = reader.range.begin;

			sreader.read(size - 8, (reader) => {
				if(aborted)
					return;
				if(!reader)
					return error(ERR_UNEXPECTED_READ_END);
				var m = parser.parseMovieFragmentBox(reader)[this.track.id];

				if(!m)
					return error(ERR_TRACK_NOT_IN_MOOF);
				var err = this.handleMoof(m);

				if(err)
					return error(err);
				m.begin = begin;
				m.end = reader.range.end;

				sreader.read(8, (reader) => {
					if(aborted)
						return;
					if(!reader)
						return error(ERR_UNEXPECTED_READ_END);
					var size = reader.readUint32();
					var type = reader.readString(4);

					if(type != 'mdat')
						return error(ERR_UNEXPECTED_BOX);
					this.moofs[len] = m;

					if(size > 0){
						m.data_end = size + reader.range.begin;

						if(this.next_moof_start < m.data_end){
							this.next_moof_start = m.data_end;
							this.duration = m.base_media_decode_time + m.samples.duration.total;
						}
					}else
						this.next_moof_start = null;
					this.processMoof(sreader, m, (err, data) => {
						if(aborted)
							return;
						this.chunk = chunk + 1;

						cb(err, data, true);

						sreader.destroy();
					});
				});
			});
		});

		return processing;
	}

	process(index, cb, min_duration = 0){
		if(index >= (this.sidx ? this.sidx.length : this.moofs.length)){
			if(this.moof_fetching && this.next_moof_start)
				return this.fetchAndProcess(this.next_moof_start, cb);
			cb(null, null);

			return;
		}

		var end = index;

		if(this.sidx){
			var dur = min_duration * this.sidx.timescale;

			while(end + 1 < this.sidx.length && this.sidx.time.start[end + 1] - start < dur)
				end++;
		}else{
			var dur = min_duration * this.track.timescale;

			var start = this.moofs[index].base_media_decode_time;

			while(end + 1 < this.moofs.length && this.moofs[end + 1].base_media_decode_time - start < dur)
				end++;
		}

		var has = true;

		for(var i = index; i <= end; i++)
			if(!this.moofs[i]){
				has = false;

				break;
			}
		if(has)
			return this.processMoofs(index, end, cb, min_duration);
		return this.processSegment(index, cb, min_duration);
	}

	processNext(min_duration, cb){
		return this.process(this.chunk, cb, min_duration);
	}

	handleMoof(track){
		if(!track.samples.size.total)
			if(!this.track.default_sample_size)
				return ERR_TRACK_SAMPLE_SIZE_UNKNOWN;
			else{
				track.samples.size.default = this.track.default_sample_size;
				track.samples.size.total = this.track.default_sample_size * track.samples.sample_count;
			}
		if(!track.samples.duration.total)
			if(this.track.default_sample_size){
				track.samples.duration.default = this.track.default_sample_size;
				track.samples.duration.total = this.track.default_sample_size * track.samples.sample_count;
			}else
				delete track.samples.duration.total;
	}

	seek(time){
		if(this.sidx){
			time = time * this.sidx.timescale;

			var l = 0;
			var r = this.sidx.length - 1;
			var starts = this.sidx.time.start;

			while(l < r){
				var mid = Math.floor((l + r + 1) / 2);

				if(starts[mid] > time)
					r = mid - 1;
				else
					l = mid;
			}

			this.chunk = l;

			return null;
		}else{
			if(time >= this.duration && this.moof_fetching)
				return ERR_TRACK_SEEK_INFO_LOADING;
			time = time * this.track.timescale;

			var l = 0;
			var r = this.moofs.length - 1;

			while(l < r){
				var mid = Math.floor((l + r + 1) / 2);
				var moof = this.moofs[mid];

				if(moof.base_media_decode_time > time)
					r = mid - 1;
				else
					l = mid;
			}

			this.chunk = l;

			return null;
		}
	}

	destroy(){
		if(this.moof_fetching)
			this.moof_fetching.abort();
	}

	fetchMoofs(){
		var cur = this.moofs[0];

		if(cur.data_end){
			this.next_moof_start = cur.data_end;

			var aborted = false;
			var sreader = this.file.read(cur.data_end);

			this.moof_fetching = {
				abort(){
					aborted = true;
					sreader.destroy();

					this.moof_fetching = null;
				}
			};

			var error = (err) => {
				sreader.destroy();

				this.moof_fetching = null;
				this.emit('error', new Error(err));
			};

			var proc = () => {
				var len = this.moofs.length;

				sreader.read(8, (reader) => {
					if(aborted)
						return;
					if(!reader)
						return this.moof_fetching = null;
					var size = reader.readUint32();
					var type = reader.readString(4);

					if(type != 'moof' || size == 0)
						return this.moof_fetching = null;
					var begin = reader.range.begin;

					sreader.read(size - 8, (reader) => {
						if(aborted)
							return;
						if(!reader)
							return error(ERR_UNEXPECTED_READ_END);
						var m = parser.parseMovieFragmentBox(reader)[this.track.id];

						if(!m)
							return error(ERR_TRACK_NOT_IN_MOOF);
						var err = this.handleMoof(m);

						if(err)
							return error(err);
						m.begin = begin;
						m.end = reader.range.end;

						sreader.read(8, (reader) => {
							if(aborted)
								return;
							if(!reader)
								return error(ERR_UNEXPECTED_READ_END);
							var size = reader.readUint32();
							var type = reader.readString(4);

							if(type != 'mdat')
								return error(ERR_UNEXPECTED_BOX);
							this.moofs[len] = m;
							this.duration = m.base_media_decode_time + m.samples.duration.total;

							if(size > 0){
								m.data_end = size + reader.range.begin;

								this.next_moof_start = m.data_end;

								sreader.seek(m.data_end);

								proc();
							}else{
								sreader.destroy();

								this.moof_fetching = null;
							}
						});
					});
				});
			};

			proc();
		}
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
}

module.exports = MpegFragmentedDataHandler;