"use-strict";

const EventEmitter = require('../util/EventEmitter');

const Codec = require('./codec');
const Format = require('./format');
const Volume = require('../format/volume');

const ERR_DESTROYED = "Player has been destroyed";
const ERR_INVALID_INPUT = "invalid input";

class ProcessItem{
	constructor(track_chunk){
		this.samples = track_chunk.samples;
		this.duration = track_chunk.samples.duration;
		this.time_seek = 0;

		this.source_timecode = track_chunk.time_offset;
		this.source_time_offset = 0;
		this.source_sample_offset = 0;
	}

	absolute_time(timescale, sample_rate){
		return (this.source_timecode + this.source_time_offset) / timescale + this.source_sample_offset / sample_rate;
	}
}

class Player extends EventEmitter{
	constructor(track, handler, output){
		super();

		this.track = track;
		this.handler = handler;
		this.handler_finished = false;

		process.nextTick(() => {
			this.emit('debug', 'PLAYER', 'INITIALIZE', track, handler);
		});

		try{
			const InCodec = Codec.from_codec(track.codec);
			const OutCodec = Codec.from_codec(output.codec);

			this.decoder = new (InCodec.Decoder)(track.sample_rate, track.channel_count, track.codec_configure);
			this.encoder = new (OutCodec.Encoder)(output.sample_rate, output.channel_count);
			this.codec_match = InCodec == OutCodec;

			this.format = new Format({sample_rate: track.sample_rate, channels: track.channel_count},
				{sample_rate: output.sample_rate, channels: output.channel_count, frame_size: output.frame_size, resample_quality: output.resample_quality});
		}catch(e){
			return process.nextTick(() => {
				this.error(e);
			});
		}

		this.frame_size = output.frame_size;
		this.bitrate = output.bitrate;
		this.sample_rate = output.sample_rate;

		this.currentTime = 0;
		this.volume = 1;

		this.processing = null;
		this.queue = [];
		this.queue.total_duration = 0;
		this.minimum_duration = 5;
		this.frames = [];
		this.encoded = [];

		this.frames_delivered = 0;
		this.frames_dropped = 0;

		this.cycle_id = 0;
		this.cycle_paused = false;

		this.handler.on('error', (err) => {
			this.error(err);
		});
	}

	decode_frame(samples){
		var out = null;

		samples.next((chunk, offset, size) => {/* synchronous function */
			out = this.decoder.process(chunk, offset, size);
		});

		if(out.sample_rate != this.track.sample_rate || out.channel_count != this.track.channel_count){
			this.emit('debug', 'PLAYER', 'DECODER UPDATE', out.sample_rate, out.channel_count, out.frame_size);

			if(out.sample_rate <= 0 || out.channel_count <= 0){
				out.error = ERR_INVALID_INPUT;

				return out;
			}

			try{
				this.format.update_input(out.sample_rate, out.channel_count);
			}catch(e){
				out.error = e.message;

				return out;
			}

			this.track.sample_rate = out.sample_rate;
			this.track.channel_count = out.channel_count;
		}

		return out;
	}

	skip_frames(processing, scaled_time){
		var samples = processing.samples;
		var curtime = samples.seek(scaled_time);

		if(curtime >= scaled_time){
			processing.source_time_offset = curtime;

			return null;
		}

		var sample_offset = 0;

		while(!samples.end){
			var out = this.decode_frame(samples);

			if(out.error)
				return out.error;
			if(!out.data)
				continue;
			if(out.frame_size)
				sample_offset += out.frame_size;
			else
				sample_offset += out.data.length / this.track.channel_count;
			if(sample_offset * this.track.timescale >= scaled_time * this.track.sample_rate)
				break;
		}

		processing.source_time_offset = curtime;
		processing.source_sample_offset = sample_offset;

		return null;
	}

	gen_frames(processing){
		var samples = processing.samples;

		while(!samples.end){
			var out = this.decode_frame(samples);

			if(out.error)
				return out.error;
			if(!out.data)
				continue;
			var processed = this.format.process(out.data);

			if(processed.error)
				return processed.error;
			processed = processed.data;

			if(!processed.length)
				continue;
			for(var j = 0; j < processed.length; j++)
				this.frames.push(processed[j]);
			break;
		}
	}

	get_processing(){
		var processing = this.processing;

		if(!processing)
			if(this.queue.length){
				processing = this.queue.shift();

				this.processing = processing;
				this.queue.total_duration -= processing.duration;

				this.currentTime = processing.absolute_time(this.track.timescale, this.track.sample_rate);
			}else
				return null;
		return processing;
	}

	execute_cycle(){
		var processing = this.get_processing();

		if(!processing){
			this.emit('debug', 'PLAYER', 'FRAME DROP', 'Nothing in processing queue');

			return null;
		}

		if(processing.time_seek){
			var error = this.skip_frames(processing, processing.source_time_offset + processing.time_seek);

			if(error)
				return error;
			processing.time_seek = 0;

			this.currentTime = processing.absolute_time(this.track.timescale, this.track.sample_rate);
		}

		if(!this.frames.length){
			var error = this.gen_frames(processing);

			if(error)
				return error;
		}

		if(this.frames.length){
			var error = this.encode(this.frames.shift());

			if(error)
				return error;
		}else{
			if(processing.samples.end && this.queue.length){
				this.processing = null;

				return this.execute_cycle();
			}

			this.emit('debug', 'PLAYER', 'FRAME DROP', 'No frame was produced');
		}

		while(this.frames.length <= 1){
			if(processing.samples.end)
				this.processing = null;
			processing = this.get_processing();

			if(!processing)
				return null;
			var error = this.gen_frames(processing);

			if(error)
				return error;
		}

		return null;
	}

	encode(audio){
		if(this.volume != 1)
			Volume(audio, this.volume);
		audio = this.encoder.process(audio, this.frame_size, this.bitrate);

		if(audio.error)
			return audio.error;
		this.encoded.push(audio.data);

		return null;
	}

	fetch_next_chunk(cb){
		var fetching = this.handler.processNext(this.minimum_duration, (err, tr, done) => {
			if(this.destroyed){
				this.emit('debug', 'PLAYER', 'LOG', 'destroyed but receiving data');
				console.trace();

				debugger;
			}

			if(err){
				this.fetching = null;

				return this.error(err);
			}

			if(!tr){
				this.handler_finished = true;
				this.fetching = null;
				this.check_finished();

				return;
			}

			tr = new ProcessItem(tr);

			this.queue.push(tr);
			this.queue.total_duration += tr.duration;

			if(done)
				this.fetching = null;
			if(cb){
				cb(tr);

				cb = null;
			}
		});

		this.fetching = fetching;
	}

	_internal_start(){
		var start = Date.now();
		var cycles = 0;
		var cyc = () => {
			if(this.cycle_id != start)
				return;
			if(this.check_finished())
				return;
			if(!this.cycle_paused){
				var delivered = false;

				if(this.encoded.length){
					this.emit('data', this.encoded.shift());

					this.frames_delivered++;
					this.currentTime += this.frame_size / this.sample_rate;

					delivered = true;
				}

				var error = this.execute_cycle();

				if(error)
					return this.error(new Error(error));
				if(!delivered){
					if(this.encoded.length){
						this.emit('data', this.encoded.shift());

						this.frames_delivered++;
						this.currentTime += this.frame_size / this.sample_rate;

						if(!this.encoded.length){
							error = this.execute_cycle();

							if(error)
								return this.error(new Error(error));
						}
					}else
						this.frames_dropped++;
				}

				if(this.destroyed){
					this.emit('debug', 'PLAYER', 'LOG', 'destroyed but cycling');
					console.trace();

					debugger;
				}

				if(!this.handler_finished && !this.fetching && this.queue.total_duration < this.minimum_duration * this.track.timescale)
					this.fetch_next_chunk();
			}

			var d = start - Date.now();
			var wait = (++cycles * this.frame_size * 1000 / this.sample_rate) + d;

			if(wait < 0){
				var drop = Math.ceil(-wait * this.sample_rate / this.frame_size / 1000);

				if(!this.cycle_paused){
					this.frames_dropped += drop;

					this.emit('debug', 'PLAYER', 'FRAME DROP', 'Lagged behind', drop, 'frame(s) (' + -wait + 'ms)');
				}

				cycles += drop;
				wait = (cycles * this.frame_size * 1000 / this.sample_rate) + d;
			}

			setTimeout(cyc, wait - 1);
		};

		this.cycle_id = start;

		cyc();
	}

	start(){
		if(this.fetching)
			this.fetching.abort();
		this.fetch_next_chunk(() => {
			this._internal_start();
		});
	}

	seek(seconds){
		if(this.destroyed)
			return ERR_DESTROYED;
		this.currentTime = seconds;
		this.format.reset();

		var timecode = seconds * this.track.timescale;

		if(!this.processing || timecode < this.processing.source_timecode || timecode > this.processing.source_timecode + this.processing.duration){
			var last = this.queue.length > 0 ? this.queue[this.queue.length - 1] : 0;

			if(this.processing && last && timecode > this.processing.source_timecode && timecode < last.source_timecode + last.duration){
				var l = 0;
				var r = this.queue.length - 1;

				while(l < r){
					var mid = Math.floor((l + r + 1) / 2);

					if(this.queue[mid].source_timecode > timecode)
						r = mid - 1;
					else
						l = mid;
				}

				for(var i = 0; i < l + 1; i++)
					this.queue.total_duration -= this.queue[i].duration;
				this.processing = this.queue[l];
				this.processing.time_seek = timecode - this.processing.source_timecode;
				this.queue.splice(0, l + 1);
			}else{
				var err = this.handler.seek(seconds);

				if(err)
					return err;
				this.handler_finished = false;
				this.queue = [];
				this.queue.total_duration = 0;
				this.processing = null;
				this.cycle_id = 0;

				if(this.fetching)
					this.fetching.abort();
				this.fetch_next_chunk((data) => {
					data.time_seek = Math.max(0, timecode - data.source_timecode);

					this._internal_start();
				});
			}
		}else{
			var p = this.processing;

			this.frames = [];

			p.time_seek = timecode - p.source_timecode;
			p.source_time_offset = 0;
			p.samples.reset();
		}

		return null;
	}

	check_finished(){
		if(this.handler_finished && !this.processing && !this.queue.length){
			this.emit('finish');

			return true;
		}

		return false;
	}

	destroy(){
		this.destroyed = true;
		this.cycle_id = 0;
		this.processing = null;
		this.queue = null;

		if(this.decoder)
			this.decoder.destroy();
		if(this.encoder)
			this.encoder.destroy();
		if(this.format)
			this.format.destroy();
		this.handler.destroy();

		if(this.fetching)
			this.fetching.abort();
	}

	error(err){
		this.emit('error', err);
	}
}

module.exports = Player;
