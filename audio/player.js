"use-strict";

const EventEmitter = require('./util/EventEmitter');

const Codec = require('./player/codec');
const Player = require('./player/player');

const ISOM = require('./demuxer/isom/reader');
const MKV = require('./demuxer/mkv/reader');
const Ogg = require('./demuxer/ogg/reader');

class AudioPlayer extends EventEmitter{
	constructor(file, output){
		super();

		this.file = file;
		this.output = output;
		this.player = null;
		this.destroyed = false;
	}

	setPaused(bool){
		if(this.player)
			this.player.cycle_paused = bool;
	}

	setVolume(vol){
		if(this.player)
			this.player.volume = vol;
	}

	setBitrate(bit){
		if(this.player)
			this.player.bitrate = bit;
	}

	setSpeed(speed){
		if(this.player)
			this.player.setSpeed(speed);
	}

	seek(time){
		if(this.player)
			return this.player.seek(time);
		return "player has not been created";
	}

	get currentTime(){
		if(this.player)
			return this.player.currentTime;
		return 0;
	}

	set currentTime(t){
		if(this.player)
			this.player.seek(t);
	}

	get duration(){
		if(this.player)
			return this.player.handler.duration / this.player.track.timescale;
		return 0;
	}

	get frames_dropped(){
		if(this.player)
			return this.player.frames_dropped;
		return 0;
	}

	get frames_delivered(){
		if(this.player)
			return this.player.frames_delivered;
		return 0;
	}

	set codec_copy_allowed(v){
		if(this.player)
			this.player.codec_copy_allowed = v;
		return v;
	}

	get codec_copy_allowed(){
		if(this.player)
			return this.player.codec_copy_allowed;
		return false;
	}

	probe(){
		var stream = this.file.read(0);
		var demuxer = [ISOM, MKV, Ogg];

		var min_bytes = 0;

		for(var i = 0; i < demuxer.length; i++)
			if(demuxer[i].PROBE_BYTES_REQUIRED > min_bytes)
				min_bytes = demuxer[i].PROBE_BYTES_REQUIRED;
		stream.ghostRead(min_bytes, (err, reader) => {
			if(err)
				return this.error(err);
			if(!reader)
				return this.error(new Error('Could not read data from stream'));
			for(var i = 0; i < demuxer.length; i++){
				var demux = demuxer[i];

				if(demux.probe_sync(reader))
					return demux.read(stream, (err, data) => {
						if(err)
							return this.error(err);
						this.createPlayer(data);
					});
				reader.reset();
			}

			stream.destroy();

			this.error(new Error('Unable to determine container or unsupported container'));
		});
	}

	createPlayer(data){
		if(this.destroyed)
			return;
		for(var i in data.tracks){
			var track = data.tracks[i];
			var codec = Codec.from_codec(track.codec);

			if(track.type == "audio" && !track.has_content_encoding && codec && codec.Decoder){
				this.player = new Player(data.tracks[i], data.createHandler(this.file, data.tracks[i]), this.output);
				this.player.on('error', (err) => {
					this.error(err);
				});

				this.player.on('data', (packet) => {
					this.emit('data', packet);
				});

				this.player.on('finish', () => {
					this.emit('finish');
				});

				this.player.on('debug', (...args) => {
					this.emit.apply(this, ['debug'].concat(args));
				});

				process.nextTick(() => {
					if(!this.destroyed)
						this.emit('ready');
				});

				return;
			}
		}

		this.error(new Error('No compatible audio tracks found'));
	}

	start(){
		if(this.player)
			this.player.start();
	}

	stop(){
		if(this.player)
			this.player.cycle_id = 0;
	}

	destroy(){
		if(this.destroyed)
			return;
		this.destroyed = true;

		if(this.player)
			this.player.destroy();
		this.player = null;
	}

	error(err){
		this.destroy();
		this.emit('error', err);
	}
}

module.exports = AudioPlayer;