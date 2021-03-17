'use-strict';

const EventEmitter = require('../../util/EventEmitter');

const parser = require('./parser');
const SampleProvider = require('./sample');

const Errors = require('../../error');

class ISOMFragmentedDataHandler extends EventEmitter{
	constructor(file, track, sidx, moofs){
		super();

		this.file = file;
		this.track = track;
		this.sidx = sidx;
		this.moofs = moofs || [];
		this.chunk = 0;

		if(track.duration > 0)
			this.duration = track.duration;
		else if(sidx)
			this.duration = sidx.time[sidx.length] * track.timescale / sidx.timescale;
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
					this.emit('error', new Error(Errors.TRACK_NOT_IN_MOOF));
				});

				this.moofs.shift();

				return;
			}
		}

		if(!sidx)
			process.nextTick(() => {
				this.fetchMoofs();
			});
	}

	processSegment(seg, cb, min_duration = 0){
		min_duration = min_duration * this.sidx.timescale;

		var start = this.sidx.byte[seg];
		var timestart = this.sidx.time[seg];
		var endseg = seg;

		while(endseg + 1 < this.sidx.length && this.sidx.time[endseg + 1] - timestart < min_duration)
			endseg++;
		var end = this.sidx.byte[endseg + 1] - 1;
		var sreader = this.file.read(start, end);

		var proc = () => {
			var begin = this.sidx.byte[seg];

			sreader.seek(begin);
			sreader.read(8, (err, reader) => {
				if(err)
					return cb(err, null);
				if(!reader)
					return cb(new Error(Errors.UNEXPECTED_READ_END), null);
				var size = reader.readUint32();
				var type = reader.readString(4);

				if(size == 0 || type != 'moof')
					return cb(new Error(Errors.UNEXPECTED_ELEMENT), null);
				sreader.read(size - 8, (err, reader) => {
					if(err)
						return cb(err);
					if(!reader)
						return cb(new Error(Errors.UNEXPECTED_READ_END), null);
					var moof = parser.parseMovieFragmentBox(reader)[this.track.id];

					if(!moof)
						return cb(new Error(Errors.TRACK_NOT_IN_MOOF), null);
					err = this.handleMoof(moof);

					if(err)
						return cb(err, null);
					moof.begin = begin;
					moof.end = reader.range.end;
					moof.data_end = end;

					this.moofs[seg] = moof;

					this.processMoof(sreader, moof, (err, data) => {
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

		return {
			abort(){
				sreader.destroy();
			}
		};
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
		sreader.read(size, (err, reader) => {
			if(err)
				return cb(err);
			if(reader)
				cb(null, {time_offset: moof.base_media_decode_time, samples: new SampleProvider(reader.read(size), moof.samples)}, true);
			else
				cb(new Error(Errors.UNEXPECTED_READ_END), null);
			if(destroy_reader)
				sreader.destroy();
		});

		return {
			abort(){
				sreader.destroy();
			}
		};
	}

	processMoofs(start, cb, min_duration = 0){
		min_duration *= this.track.timescale;

		var moof = this.moofs[start];
		var bytestart = moof.begin + moof.data_offset;

		var sreader = this.file.read(bytestart);

		var proc = () => {
			this.processMoof(sreader, this.moofs[start], (err, data) => {
				if(err)
					return cb(err, null);
				min_duration -= data.samples.duration;

				this.chunk = ++start;

				if(min_duration <= 0 || ((!this.moof_fetching || !this.next_moof_start) && !this.moofs[start])){
					cb(null, data, true);

					sreader.destroy();
				}else{
					cb(null, data, false);

					if(!this.moofs[start])
						proc = () => {
							this.fetchAndProcess(0, sreader, (err, data) => {
								if(err)
									return cb(err, null);
								cb(null, data, data == null);

								if(data != null){
									min_duration -= data.samples.duration;

									if(min_duration > 0)
										proc();
									else
										sreader.destroy();
								}
							});
						};
					proc();
				}
			});
		};

		proc();

		return {
			abort(){
				sreader.destroy();
			}
		};
	}

	fetchAndProcess(byte_start, sreader, cb){
		var len = this.moofs.length;
		var chunk = this.chunk;

		var destroy_reader = sreader ? false : true;

		if(!sreader)
			sreader = this.file.read(byte_start);
		var error = (err) => {
			sreader.destroy();

			cb(err, null);
		};

		sreader.read(8, (err, reader) => {
			if(err)
				return error(err);
			if(!reader)
				return cb(null, null);
			var size = reader.readUint32();
			var type = reader.readString(4);

			if(type != 'moof' || size == 0)
				return cb(null, null);
			var begin = reader.range.begin;

			sreader.read(size - 8, (err, reader) => {
				if(err)
					return error(err);
				if(!reader)
					return error(new Error(Errors.UNEXPECTED_READ_END));
				var m = parser.parseMovieFragmentBox(reader)[this.track.id];

				if(!m)
					return error(new Error(Errors.TRACK_NOT_IN_MOOF));
				err = this.handleMoof(m);

				if(err)
					return error(new Error(err));
				m.begin = begin;
				m.end = reader.range.end;

				sreader.read(8, (err, reader) => {
					if(err)
						return cb(err, null);
					if(!reader)
						return error(new Error(Errors.UNEXPECTED_READ_END));
					var size = reader.readUint32();
					var type = reader.readString(4);

					if(type != 'mdat')
						return error(new Error(Errors.UNEXPECTED_ELEMENT));
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
						this.chunk = chunk + 1;

						cb(err, data, true);

						if(destroy_reader)
							sreader.destroy();
					});
				});
			});
		});

		return {
			abort(){
				sreader.destroy();
			}
		};
	}

	process(index, cb, min_duration = 0){
		if(index >= (this.sidx ? this.sidx.length : this.moofs.length)){
			if(this.moof_fetching && this.next_moof_start)
				return this.fetchAndProcess(this.next_moof_start, null, cb);
			cb(null, null);

			return;
		}

		var end = index;

		if(this.sidx){
			var dur = min_duration * this.sidx.timescale;

			while(end + 1 < this.sidx.length && this.sidx.time[end + 1] - start < dur)
				end++;
		}else{
			var dur = min_duration * this.track.timescale;

			var start = this.moofs[index].base_media_decode_time;

			while(end + 1 < this.moofs.length && this.moofs[end + 1].base_media_decode_time - start < dur)
				end++;
		}

		var has = true;

		if(this.sidx)
			for(var i = index; i <= end; i++)
				if(!this.moofs[i]){
					has = false;

					break;
				}
		if(has)
			return this.processMoofs(index, cb, min_duration);
		return this.processSegment(index, cb, min_duration);
	}

	processNext(min_duration, cb){
		return this.process(this.chunk, cb, min_duration);
	}

	handleMoof(track){
		if(!track.samples.size.total)
			if(!this.track.default_sample_size)
				return Errors.TRACK_SAMPLE_DATA_UNKNOWN;
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
			var starts = this.sidx.time;

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
				return Errors.SEEK_INFO_LOADING;
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

			var sreader = this.file.read(cur.data_end);

			this.moof_fetching = {
				abort(){
					sreader.destroy();

					this.moof_fetching = null;
				}
			};

			var error = (err) => {
				sreader.destroy();

				this.moof_fetching = null;
				this.emit('error', err);
			};

			var proc = () => {
				var len = this.moofs.length;

				sreader.read(8, (err, reader) => {
					if(err)
						return error(err);
					if(!reader)
						return this.moof_fetching = null;
					var size = reader.readUint32();
					var type = reader.readString(4);

					if(type != 'moof' || size == 0)
						return this.moof_fetching = null;
					var begin = reader.range.begin;

					sreader.read(size - 8, (err, reader) => {
						if(err)
							return error(err);
						if(!reader)
							return error(new Error(Errors.UNEXPECTED_READ_END));
						var m = parser.parseMovieFragmentBox(reader)[this.track.id];

						if(!m)
							return error(new Error(Errors.TRACK_NOT_IN_MOOF));
						err = this.handleMoof(m);

						if(err)
							return error(new Error(err));
						m.begin = begin;
						m.end = reader.range.end;

						sreader.read(8, (err, reader) => {
							if(err)
								return error(err);
							if(!reader)
								return error(new Error(Errors.UNEXPECTED_READ_END));
							var size = reader.readUint32();
							var type = reader.readString(4);

							if(type != 'mdat')
								return error(new Error(Errors.UNEXPECTED_ELEMENT));
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
}

module.exports = ISOMFragmentedDataHandler;