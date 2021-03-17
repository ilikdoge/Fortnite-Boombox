"use-strict";

const Codec = require('./codec');
const Format = require('./format');
const Volume = require('../format/volume');

const ERR_DECODER_ERROR = "decoder error";
const ERR_ENCODER_ERROR = "encoder error";

class Player{
	constructor(track, handler, output){
		this.track = track;
		this.handler = handler;
		this.handler_finished = false;

		try{
			this.decoder = new (Codec.from_codec(track.codec).Decoder)(track.sample_rate, track.channel_count);
			this.encoder = new (Codec.from_codec(output.codec).Encoder)(output.sample_rate, output.channel_count);
		}catch(e){
			return process.nextTick(() => {
				this.error(e);
			});
		}

		this.format = new Format({sample_rate: track.sample_rate, channels: track.channel_count},
			{sample_rate: output.sample_rate, channels: output.channel_count, frame_size: output.frame_size});

		this.frame_size = output.frame_size;
		this.bitrate = output.bitrate;
		this.sample_rate = output.sample_rate;

		this.currentTime = 0;
		this.volume = 1;

		this.processing = null;
		this.processingQueue = [];
		this.processingQueue.total_duration = 0;
		this.minimum_duration = 5;

		this.frames_delivered = 0;
		this.frames_dropped = 0;

		this.cycle_id = 0;
		this.cycle_paused = false;

		this._events = {};

		this.handler.on('error', (err) => {
			this.error(new Error(err));
		});
	}

	skip_frames(processing, absolute_time){
		var samples = processing.samples;/*.size.entries;
		var def = processing.samples.size.default;
		var offset = processing.offset;
		var chunk = processing.data;*/
		var curtime = samples.seek(absolute_time);

		if(curtime >= absolute_time){
			processing.source_time_offset = curtime;

			return null;
		}

		while(!samples.end){
			var out;

			samples.next((chunk, offset, size) => {/* synchronous function */
				out = this.decoder.process(chunk, offset, size);
			});

			if(out[0])
				return ERR_DECODER_ERROR;
			if(!out[1])
				continue;
			curtime += out[1].length / this.track.channel_count * this.track.timescale / this.track.sample_rate;

			if(curtime >= absolute_time)
				break;
		}

		processing.source_time_offset = curtime;

		return null;
	}

	gen_frames(processing){
		var frames = processing.frameBuffer;
		var samples = processing.samples;/*
		var def = processing.samples.size.default;
		var offset = processing.offset;
		var chunk = processing.data;*/

		while(!samples.end){
			var out;

			samples.next((chunk, offset, size) => {
				out = this.decoder.process(chunk, offset, size);
			});

			if(out[0])
				return ERR_DECODER_ERROR;
			if(!out[1])
				continue;
			var processed = this.format.process(out[1]);

			if(processed.error)
				return processed.error;
			processed = processed.data;

			if(!processed.length)
				continue;
			for(var j = 0; j < processed.length; j++)
				frames.push(processed[j]);
			break;
		}
	}

	execute_cycle(){
		var processing = this.processing;

		if(!processing)
			if(this.processingQueue.length){
				processing = this.processingQueue.shift();

				this.processing = processing;
				this.processingQueue.total_duration -= processing.duration;

				this.currentTime = processing.source_timecode / this.track.timescale;
			}else{
				this.frames_dropped++;

				return null;
			}
		if(processing.time_seek){
			var error = this.skip_frames(processing, processing.source_time_offset + processing.time_seek);

			if(error)
				return error;
			processing.time_seek = 0;

			this.currentTime = (processing.source_timecode + processing.source_time_offset) / this.track.timescale;
		}

		if(!processing.frameBuffer.length){
			var error = this.gen_frames(processing);

			if(error)
				return error;
		}

		if(processing.frameBuffer.length){
			var error = this.deliver(processing.frameBuffer.shift());

			if(error)
				return error;
			this.frames_delivered++;
			this.currentTime += this.frame_size / this.sample_rate;
		}else{
			if(processing.samples.end && this.processingQueue.length){
				this.processing = null;

				return this.execute_cycle();
			}

			this.frames_dropped++;
		}

		if(processing.samples.end && !processing.frameBuffer.length)
			this.processing = null;
		return null;
	}

	deliver(audio){
		if(this.volume != 1)
			Volume(audio, this.volume);
		audio = this.encoder.process(audio, this.frame_size, this.bitrate);

		if(audio[0])
			return ERR_ENCODER_ERROR;
		this.emit('data', audio[1]);

		return null;
	}

	init_processing(track_chunk){
		var processing = {};

		/*processing.data = track_chunk.data;*/
		processing.samples = track_chunk.samples;
		/*processing.length = track_chunk.samples.sample_count;
		processing.index = 0;
		processing.offset = 0;*/
		processing.source_timecode = track_chunk.time_offset;
		processing.source_time_offset = 0;
		processing.time_seek = 0;
		processing.duration = processing.samples.duration;
		processing.frameBuffer = [];
		//processing.decoder = this.decoder;

		return processing;
	}

	fetch_next_chunk(cb){
		var fetching = this.handler.processNext(this.minimum_duration, (err, tr, done) => {
			if(err){
				this.fetching = null;

				return this.error(new Error(err));
			}

			if(!tr){
				this.handler_finished = true;

				this.check_finished();

				return;
			}

			tr = this.init_processing(tr);

			if(!tr.duration)
				tr.duration = this.minimum_duration * this.track.timescale;
			this.processingQueue.push(tr);
			this.processingQueue.total_duration += tr.duration;

			if(done)
				this.fetching = null;
			if(cb){
				cb(tr);

				cb = null;
			}
		});

		this.fetching = fetching;
	}

	_internalStart(){
		var start = Date.now();
		var cycles = 0;
		var cyc = () => {
			if(this.cycle_id != start)
				return;
			if(this.check_finished())
				return;
			var d = start - Date.now();
			var wait = (++cycles * this.frame_size * 1000 / this.sample_rate) + d;

			while(wait < -this.frame_size * 1000 / this.sample_rate){
				wait = (++cycles * this.frame_size * 1000 / this.sample_rate) + d;

				if(!this.cycle_paused)
					this.frames_dropped++;
			}

			setTimeout(cyc, wait);

			if(!this.cycle_paused){
				if(wait < 0)
					this.frames_dropped++;
				var error = this.execute_cycle();

				if(error)
					return this.emit('error', new Error(error));

				if(!this.handler_finished && !this.fetching && this.processingQueue.total_duration < this.minimum_duration * this.track.timescale)
					this.fetch_next_chunk();
			}
		};

		this.cycle_id = start;

		cyc();
	}

	start(){
		this.fetch_next_chunk(() => {
			this._internalStart();
		});
	}

	seek(seconds){
		this.currentTime = seconds;
		this.format.reset();

		var timecode = seconds * this.track.timescale;

		if(!this.processing || timecode < this.processing.source_timecode || timecode > this.processing.source_timecode + this.processing.duration){
			var last = this.processingQueue.length > 0 ? this.processingQueue[this.processingQueue.length - 1] : 0;

			if(this.processing && last && timecode > this.processing.source_timecode && timecode < last.source_timecode + last.duration){
				var l = 0;
				var r = this.processingQueue.length - 1;

				while(l < r){
					var mid = Math.floor((l + r + 1) / 2);

					if(this.processingQueue[mid].source_timecode > timecode)
						r = mid - 1;
					else
						l = mid;
				}

				for(var i = 0; i < l + 1; i++)
					this.processingQueue.total_duration -= this.processingQueue[i].duration;
				this.processing = this.processingQueue[l];
				this.processing.time_seek = timecode - this.processing.source_timecode;
				this.processingQueue.splice(0, l + 1);
			}else{
				this.processingQueue = [];
				this.processingQueue.total_duration = 0;
				this.processing = null;
				this.cycle_id = 0;

				if(this.fetching)
					this.fetching.abort();
				var err = this.handler.seek(seconds);

				if(err)
					return err;
				this.handler_finished = false;
				this.fetch_next_chunk((data) => {
					data.time_seek = timecode - data.source_timecode;

					this._internalStart();
				});
			}
		}else{
			var p = this.processing;

			p.frameBuffer = [];
			p.time_seek = timecode - p.source_timecode;
			p.samples.reset();
		}

		return null;
	}

	check_finished(){
		if(this.handler_finished && !this.processing && !this.processingQueue.length){
			this.emit('finish');

			return true;
		}

		return false;
	}

	destroy(){
		this.cycle_id = 0;
		this.processing = null;
		this.processingQueue = null;
		this.decoder.destroy();
		this.encoder.destroy();
		this.format.destroy();
		this.handler.destroy();

		if(this.fetching)
			this.fetching.abort();
	}

	error(err){
		this.emit('error', err);
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

	/*
	seek(seconds){
		var seek = this.handler.timeToSegment(seconds);

		if(seek[0])
			return;
		if(this.processing){
			this.processing.abort();
			this.processing = null;
		}

		this.time_skip = this.track.timescale * seconds - this.handler.segmentToTime(seek[1]);
		this.chunk = seek[1];
		this.next_chunk();
	}

	process(chunk, sample_data, time_skip, cb){
		var start = Date.now();
		var period = this.frame_size * 1000 / this.sample_rate;
		var aborted = false;
		var i = 0;
		var len = sample_data.sample_count;

		this.processing = {abort: () => {
			aborted = true;

			if(i < len)
				this.reset_decoder();
		}};

		var offset = 0;
		var def = sample_data.size.entries ? null : sample_data.size.default;
		var entries = sample_data.size.entries;
		var curtime = 0;

		if(time_skip > 0)
			for(; i < len; i++){
				var out = null;
				var size = null;

				if(def)
					size = def;
				else
					size = entries[i];
				out = this.decoder.process(chunk, offset, size);
				offset += size;

				if(out[0])
					return cb(true);
				out = out[1];

				if(!out)
					continue;
				curtime += out.length / this.track.channel_count;

				if(curtime >= time_skip){
					i++;

					break;
				}
			}
		var buffer = [];
		var proc = () => {
			if(aborted)
				return;
			if(!buffer.length){
				for(; i < len; i++){
					var out = null;
					var size = null;

					if(def)
						size = def;
					else
						size = entries[i];
					out = this.decoder.process(chunk, offset, size);

					offset += size;

					if(out[0])
						return cb(true);
					out = out[1];

					if(!out)
						continue;
					var processed = this.format.process(out, this.volume);

					if(processed[0])
						return cb(true);
					processed = processed[1];

					if(!processed)
						continue;
					for(var j = 0; j < processed.length; j++){
						var encoded = this.encoder.process(processed[j], this.frame_size, this.bitrate);

						if(encoded[0])
							return cb(true);
						buffer.push(encoded[1]);
					}

					i++;

					break;
				}
			}

			if(buffer.length)
				this.deliver(buffer.shift());
			if(i >= len && !buffer.length)
				return cb(null);
			start += period;

			setTimeout(proc, period + start - Date.now());
		};

		proc();
	}

	reset_decoder(){
		this.decoder.destroy();
		this.decoder = new (Codec.fromCodec(this.track.codec).Decoder)(this.track.sample_rate, this.track.channel_count);
	}

	deliver(encoded){
		this.emit('send', encoded);
	}

	start(){
		this.next_chunk();
	}

	next_chunk(){
		var chunk = this.chunk++;

		if(chunk >= this.handler.length)
			return;
		this.handler.process(chunk, (err, tr) => {
			if(err)
				return this.error(new Error(err));
			this.next_data = tr;

			if(!this.processing)
				this.next_process();
		});
	}

	next_process(){
		var tr = this.next_data;

		if(tr){
			this.next_data = null;
			this.process(tr.data, tr.samples, this.time_skip, (err) => {
				if(err)
					return this.error();
				this.processing = null;
				this.next_process();
			});

			this.time_skip = 0;
			this.next_chunk();
		}
	}

	stop(){

	}

	error(err){
		this.emit('err', err);
	}
	*/
}

module.exports = Player;