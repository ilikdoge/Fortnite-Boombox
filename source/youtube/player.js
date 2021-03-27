const {isMainThread, parentPort, workerData} = require('worker_threads');

if(isMainThread)
	throw new Error('cannot be on main thread');
global.debug = function(source, type, ...message){
	parentPort.postMessage(['log', [source, type, ...message]]);
};

const EventEmitter = require('../../audio/util/EventEmitter');
const AudioPlayer = require('../../audio/player');
const StreamReader = require('../../audio/util/StreamReader');
const ISOM = require('../../audio/demuxer/isom/reader');

const {Readable} = require('stream');
const request = require('request');

const ERR_INVALID_STREAM = "invalid stream data";
const ERR_NO_REFERENCE_TIME = "no reference time";

const MAX_SEEK_BACK = 4 * 60 * 60; /* max seek back 4 hr */

class YoutubeSeekableStream extends Readable{
	constructor(lp, url, start, end){
		super();

		this.lp = lp;
		this.url = url;
		this.start = start;
		this.end = end;
		this.create(start, end);
	}

	create(start, end){
		if(this.stream){
			this.stream.aborted = true;
			this.stream.abort();
		}

		if(start > end)
			return this.push(null);
		var stream = this.stream = request({url: this.url, method: 'GET', headers: {range: 'bytes=' + (start ? start : '0') + '-' + (end ? end : '')}});

		this.stream.on('response', (resp) => {
			if(stream != this.stream){
				stream.abort();

				return;
			}
			
			this.url = resp.request.uri.href;
			this.lp.update(resp.headers['x-head-seqnum']);

			if(resp.statusCode < 200 || resp.statusCode >= 400){
				stream.abort();

				this.emit('error', new Error('bad http response code ' + resp.statusCode));
			}
		});

		this.stream.on('data', (buf) => {
			if(stream != this.stream){
				stream.abort();

				return;
			}
			
			this.push(buf);
		});

		this.stream.on('error', (err) => {
			stream.abort();
			
			if(stream != this.stream)
				return;
			this.emit('error', err);
		});

		this.stream.on('end', () => {
			if(stream != this.stream)
				return;
			if(!stream.aborted)
				this.push(null);
		});
	}

	seek(start){
		this.create(start, this.end);
	}

	_destroy(){
		this.stream.abort();
		this.stream = null;
	}

	_read(){}
}

class YoutubeStreamFileProvider{
	constructor(lp, url){
		this.lp = lp;
		this.url = url;
	}

	read(start/*, end*/){/* no end stability reasons */
		var sr = new StreamReader(new YoutubeSeekableStream(this.lp, this.url, start));

		sr.position = start;

		return sr;
	}
}

class YoutubeLiveHandler extends EventEmitter{
	constructor(lp, track){
		super();

		this.lp = lp;
		this.track = track;
		this.current_sequence = lp.head_sequence - 2;
		this.duration = 0;
	}

	processNext(min_duration, cb){
		if(this.current_sequence + 1 >= this.lp.head_sequence){
			var aborted = false;
			var req = null;
			var processing = {
				abort(){
					aborted = true;

					if(req)
						req.abort();
				}
			};

			setTimeout(() => {
				if(aborted)
					return;
				req = request({url: this.lp.url + '&sq=' + (this.lp.head_sequence + 1), method: 'GET'});

				req.on('response', (resp) => {
					if(resp.statusCode < 200 || resp.statusCode >= 400)
						cb(null, null, true);
					else if(parseInt(resp.headers['x-head-seqnum'], 10) < this.current_sequence + 1)
						cb(null, null, true);
					else{
						req.abort();

						this.lp.update(resp.headers['x-head-seqnum']);

						req = this.processNext(0, cb);

						return;
					}

					req.abort();
				});

				req.on('error', (err) => {
					if(aborted)
						return;
					if(err)
						cb(err, null);
					req.abort();
				})
			}, this.current_sequence >= this.lp.head_sequence ? this.lp.target_duration * 1000 + this.lp.update_time - Date.now() : 0);

			return processing;
		}

		var file = new YoutubeStreamFileProvider(this.lp, this.lp.url + '&sq=' + (++this.current_sequence));
		var stream = file.read(0);
		var aborted = false;
		var handler = null;
		var handler_processing = null;
		var processing = {
			abort(){
				aborted = true;
				stream.destroy();

				if(handler)
					handler.destroy();
				if(handler_processing)
					handler_processing.abort();
			}
		};

		ISOM.read(stream, (err, data) => {
			if(aborted)
				return;
			if(err)
				return cb(new Error(err), null);
			var track = data.tracks[this.track.id];

			if(!track || track.codec != this.track.codec || track.sample_rate != this.track.sample_rate ||
				track.channel_count != this.track.channel_count || track.timescale != this.track.timescale)
				return cb(new Error(ERR_INVALID_STREAM), null);
			handler = data.createHandler(file, track);

			if(handler.fetchMoofs){
				handler.fetchMoofs = function(){};

				if(!handler.sidx){
					handler.next_moof_start = handler.moofs[0].data_end;
					handler.moof_fetching = {
						abort(){

						}
					};
				}
			}

			if(handler.moof_fetching)
				handler.moof_fetching.abort();
			handler.on('error', (err) => {
				this.emit('error', err);
			});

			var last = null;
			var start_time = false;
			var pr = handler.processNext(Infinity, (err, data, done) => {
				if(aborted)
					return;
				if(err){
					handler.destroy();

					return cb(err, null);
				}

				if(!start_time && data){
					start_time = true;

					if(this.seeking_to)
						if(data.time_offset > this.seeking_to){
							var estimate_seq = (this.seeking_to - data.time_offset) / (this.track.timescale * this.lp.target_duration);

							this.current_sequence += Math.floor(estimate_seq) - 1;

							if(this.current_sequence < -1){
								this.current_sequence = -1;
								this.seeking_to = null;
							}

							if(pr)
								pr.abort();
							processing.abort = this.processNext(0, cb).abort;

							return;
						}else if(data.time_offset + 2 * this.lp.target_duration * this.track.timescale < this.seeking_to){
							var estimate_seq = (this.seeking_to - data.time_offset) / (this.track.timescale * this.lp.target_duration);

							this.current_sequence += Math.floor(estimate_seq);

							if(pr)
								pr.abort();
							return;
						}else
							this.seeking_to = null;
					this.reference = {time: data.time_offset, sequence: this.current_sequence};
				}

				if(done){
					handler.destroy();

					if(last)
						cb(null, last, data == null);
					if(data)
						cb(null, data, true);
				}else{
					if(last)
						cb(null, last, false);
					last = data;
				}
			});

			handler_processing = pr;

			if(!pr)
				handler.destroy();
		});

		return processing;
	}

	seek(time){
		if(!this.reference)
			return ERR_NO_REFERENCE_TIME;
		var estimate_seq = (time - this.reference.time / this.track.timescale) / this.lp.target_duration;

		this.current_sequence += Math.floor(estimate_seq) - 1;

		if(this.current_sequence > this.lp.head_sequence - 2)
			this.current_sequence = this.lp.head_sequence - 2;
		else if((this.lp.head_sequence - this.current_sequence) * this.lp.target_duration > MAX_SEEK_BACK || this.current_sequence < 0)
			this.current_sequence = Math.max(-1, this.lp.head_sequence - (MAX_SEEK_BACK / this.lp.target_duration));
		else
			this.seeking_to = time * this.track.timescale;
	}

	destroy(){}
}

class YoutubeLivePlayer extends AudioPlayer{
	constructor(url, duration){
		super();

		this.url = url;
		this.target_duration = duration;
		this.head_sequence = -1;

		debug('LIVESTREAM', 'INITIALIZE', url, duration);
	}

	start(output){
		this.output = output;

		var file = new YoutubeStreamFileProvider(this, this.url);

		ISOM.read(file.read(0), (err, data) => {
			if(err)
				return this.error(new Error(err));
			data.createHandler = (file, track) => {
				return new YoutubeLiveHandler(this, track);
			};

			this.createPlayer(data);
			this.player.minimum_duration = Math.min(5, this.target_duration * 2);
			this.player.start();
		});
	}

	update(head_sequence){
		head_sequence = parseInt(head_sequence, 10);

		if(head_sequence > this.head_sequence){
			this.head_sequence = head_sequence;
			this.update_time = Date.now();
		}
	}

	get current_sequence(){
		if(this.player)
			return this.player.handler.current_sequence;
		return 0;
	}
}

var player = new YoutubeLivePlayer(workerData.url, workerData.duration);

player._events = {error: [
	function(){
		parentPort.postMessage(['error', err.message, err.stack])
	}
], data: [
	function(){
		parentPort.postMessage(['data', data]);
	}
], finish: [
	function(){
		parentPort.postMessage(['finish']);
	}
], ready: [
	function(){
		parentPort.postMessage(['ready']);
	}
]};

parentPort.on('message', (args) => {
	var v = args[0];

	if(v == 'start')
		player.start(args[1]);
	else if(v == 'destroy')
		player.destroy();
	else if(v == 'stop')
		player.stop();
	else if(v == 'setPaused')
		player.setPaused(args[1]);
	else if(v == 'setVolume')
		player.setVolume(args[1]);
	else if(v == 'setBitrate')
		player.setBitrate(args[1]);
	else if(v == 'seek')
		parentPort.postMessage(['seek', player.seek(v[1])]);
	else if(v == 'currentTime'){
		if(v[1])
			player.currentTime = v[1];
		else
			parentPort.postMessage(['currentTime', player.currentTime]);
	}else if(v == 'duration')
		parentPort.postMessage(['duration', player.duration]);
	else if(v == 'frames_dropped')
		parentPort.postMessage(['frames_dropped', player.frames_dropped]);
	else if(v == 'frames_delivered')
		parentPort.postMessage(['frames_delivered', player.frames_delivered]);
});
