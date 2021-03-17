const MediaItem = require('../../common/mediaitem');
const parse = require('url').parse;
const yt = require('./api');
const ytlive = require('./live');
const Errors = require('../../audio/error');
const request = require('request');
const {Readable} = require('stream');
const StreamReader = require('../../audio/util/StreamReader');

class YTSeekableStream extends Readable{
	constructor(item, start, end){
		super();

		this.item = item;
		this.start = start;
		this.end = end;
		this.tries = 0;
		this.destroyed = false;
		this.create(start, end);
	}

	create(start, end){
		if(this.stream){
			this.stream.aborted = true;
			this.stream.abort();
			this.stream = null;
		}

		if(start > end)
			return this.push(null);
		if(!this.item.url){
			this.item.fetch((err) => {
				if(this.destroyed)
					return;
				if(err)
					return this.emit(err);
				this.create(start, end);
			});

			return;
		}

		var stream = this.stream = request({url: this.item.url, headers: {range: 'bytes=' + (start ? start : '0') + '-' + (end ? end : '')}, gzip: true});

		this.stream.on('response', (resp) => {
			if(resp.statusCode < 200 || resp.statusCode >= 400){
				stream.abort();

				if(resp.statusCode == 416)
					this.push(null);
				else if(resp.statusCode == 403){
					if(this.tries > 5)
						return this.emit('error', new Error('HTTP 403 Access denied'));
					stream.aborted = true;
					stream.abort();
					this.stream = null;

					this.item.fetch((err) => {
						if(this.destroyed)
							return;
						if(err)
							return this.emit(err);
						this.tries++;
						this.create(start, end);
					});
				}else
					this.emit('error', new Error(Errors.gen_http_error(resp.statusCode)));
			}else{
				this.tries = 0;
				this.item.url = resp.request.uri.href;

				var content_range = /^bytes ([0-9]+?)-([0-9]*?)\/([0-9]*|\*)$/.exec(resp.headers['content-range']);

				if(!content_range){
					stream.abort();

					return this.emit('error', new Error(Errors.NO_CONTENT_RANGE));
				}

				if(content_range[1] != start || (end && content_range[2] != end)){
					stream.abort();

					return this.emit('error', new Error(Errors.BAD_CONTENT_RANGE));
				}
			}
		});

		this.stream.on('data', (buffer) => {
			this.push(buffer);
		});

		this.stream.on('error', (err) => {
			stream.abort();

			this.emit('error', err);
		});

		this.stream.on('end', () => {
			if(!stream.aborted)
				this.push(null);
		});
	}

	seek(start){
		this.create(start, this.end);
	}

	_destroy(){
		this.destroyed = true;
		this.stream.abort();
	}

	_read(){}
}

class YTFileProvider{
	constructor(item){
		this.item = item;
	}

	read(start, end){
		var sr = new StreamReader(new YTSeekableStream(this.item, start, end));

		sr.position = start;

		return sr;
	}
}

class itemYT extends MediaItem{
	constructor(result, stream){
		super();

		this.setPublisher(result.publisher.name, result.publisher.thumbnails ? this._lastThumbnail(result.publisher.thumbnails) : null);
		this.setMetadata(result.video.title, this._lastThumbnail(result.video.thumbnails));

		if(result.video.duration)
			this.setDuration(result.video.duration, 0.5);
		this._result = result;

		delete result.publisher;

		result.video = {id: result.video.id};

		if(stream){
			this.url = stream.url;
			this.setDuration(stream.duration, 0);
		}
	}

	get custom_player(){
		if(this.live_player)
			return this.live_player;
		if(this._result.streams && this._result.streams.live){
			this.live_player = ytlive.create(this.url, this.duration.seconds);

			return this.live_player;
		}
	}

	_chooseThumbnail(array){
		if(!array)
			return null;
		var size = 0;
		var url = null;

		for(var i = 0; i < array.length; i++)
			if(array[i].width * array[i].height > size){
				url = array[i].url;
				size = array[i].width * array[i].height;
			}
		return url;
	};

	_lastThumbnail(array){
		if(!array)
			return null;
		return array[array.length - 1].url;
	}

	_getUrlFromStreams(streams){
		var astr = {mp4: [], webm: []};

		for(var i = 0; i < streams.adaptive.length; i++){
			var stream = streams.adaptive[i];

			if(stream.type.stream == 'audio')
				astr[stream.type.container].push(stream);
		}

		if(astr.webm.length){
			astr = astr.webm;

			var opus = [];

			for(var i = 0; i < astr.length; i++)
				if(astr[i].type.codecs == "opus")
					opus.push(astr[i]);
			if(opus.length)
				astr = opus;
		}else if(astr.mp4.length)
			astr = astr.mp4;
		else if(streams.standard.length)
			return {url: streams.standard[0].url, duration: null};
		else
			return null;
		var stream = astr[0];
		var bitrate = astr[0].bitrate;

		for(var i = 1; i < astr.length; i++){
			var bit = astr[i].bitrate;

			if(bit > bitrate){
				bitrate = bit;
				stream = astr[i];
			}
		}

		if(stream.target_duration_sec)
			return {url: stream.url, duration: stream.target_duration_sec};
		var query = parse(stream.url, true).query;

		if(query.dur)
			return {url: stream.url, duration: parseFloat(query.dur)};
		else
			return {url: stream.url, duration: null};
	}

	_getUrlStream(callback){
		this._result.streams = null;
		this._result.getStreams((err, streams) => {
			if(err)
				return callback(err, null);
			this.setPublisher(this._result.publisher.name, this._result.publisher.thumbnails ? this._lastThumbnail(this._result.publisher.thumbnails) : null);
			this.setMetadata(this._result.video.title, this._lastThumbnail(this._result.video.thumbnails));

			var stream = this._getUrlFromStreams(streams);

			this._result.streams = {live: streams.live};

			if(stream){
				this.url = stream.url;
				this.setDuration(stream.duration, 0);

				callback(null, stream.url);
			}else
				return callback(new Error('No streams available'), null);
		});
	}

	fetch(callback){
		this._getUrlStream((err) => {
			if(err)
				return callback(err);
			this.setPublisher(this._result.publisher.name, this._result.publisher.thumbnails ? this._lastThumbnail(this._result.publisher.thumbnails) : null);

			callback(null);
		});
	}

	get stats(){
		if(this.live_player)
			return [{
				name: 'Live Sequence',
				value: this.live_player.current_sequence + ' / ' + this.live_player.head_sequence,
				inline: true
			}];
	}

	get discriminator(){
		return ['yt', 'v:' + this._result.video.id];
	}

	get sourceurl(){
		return 'https://www.youtube.com/watch?v=' + this._result.video.id;
	}

	getFile(){
		return new YTFileProvider(this);
	}
}

class sourceYT{
	constructor(){
		this.playlistLimit = 1000;
	}

	_makeItem(result){
		var stream = null;

		if(result.streams){
			stream = itemYT.prototype._getUrlFromStreams.apply(null, [result.streams]);

			if(!stream)
				return [new Error('No streams available'), null];
		}

		return [null, new itemYT(result, stream)];
	}

	_match(args){
		var url = this._url(args);
		if(url){
			url = parse(url[0], true);

			if(url.hostname == 'youtu.be' && /\/([a-zA-Z0-9_-]{11})/.exec(url.pathname)){
				if(url.query.t){
					var s = 0;
					var t = /(?:([0-9]+?)h)?(?:([0-9]+?)m)?(?:([0-9]+?)s)?/.exec(url.query.t);

					if(t[1])
						s += parseInt(t[1], 10) * 3600;
					if(t[2])
						s += parseInt(t[2], 10) * 60;
					if(t[3])
						s += parseInt(t[3], 10);
					return {video: {id: url.pathname.substring(1), options: {trim: {start: s, end: null}}}};
				}else
					return {video: {id: url.pathname.substring(1)}};
			}else
				if(url.pathname == '/watch' && /([a-zA-Z0-9_-]{11})/.exec(url.query.v)){
					var match = null;

					if(url.query.t){
						var s = 0;
						var t = /(?:([0-9]+?)h)?(?:([0-9]+?)m)?(?:([0-9]+?)s)?/.exec(url.query.t);

						if(t[1])
							s += parseInt(t[1], 10) * 3600;
						if(t[2])
							s += parseInt(t[2], 10) * 60;
						if(t[3])
							s += parseInt(t[3], 10);
						match = {video: {id: url.query.v, options: {trim: {start: s, end: null}}}};
					}else
						match = {video: {id: url.query.v}};
					if(url.query.list)
						match.playlist = {id: url.query.list};
					return match;
				}else if(url.pathname == '/playlist' && /([a-zA-Z0-9_-]*)/.exec(url.query.list))
					return {playlist: {id: url.query.list}};
		}else{
			var maybeId = /^([a-zA-Z0-9_-]{11})$/.exec(args);
			var plist = /^((?:PL|LL|FL|UU)[a-zA-Z0-9_-]+)/.exec(args);

			if(plist)
				return {playlist: {id: plist[0]}};
			if(maybeId)
				return {idMatch: {id: maybeId[1]}};
		}
	}

	_url(args){
		return /^https?:\/\/((?:www\.)?youtube\.com|youtu\.be)\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/.exec(args);
	}

	matches(args){
		var url = this._url(args);

		if(url)
			if(url[1] == 'youtu.be')
				return /\/([a-zA-Z0-9_-]{11})/.exec(url[2]) ? true : false;
			else if(/(?:www\.)?youtube\.com/.exec(url[1]))
				return /\/(watch|playlist)/.exec(url[2]) ? true : false;
		return false;
	}

	get(args, callbacks){
		var match = this._match(args);

		if(!match){
			callbacks.configure('search');

			return this.search(args, function(err, data){
				if(err)
					callbacks.error(err);
				else
					callbacks.search(data);
			});
		}

		if(match.playlist){
			if(match.video){
				var pd = false;
				var vd = false;
				var list = null;
				var video = null;

				var finish = function(){
					if(!list && !video)
						callbacks.error(new Error('Error not found'));
					else if(!list){
						callbacks.configure('media');
						callbacks.media(video);
					}else if(!video)
						callbacks.playlist(list);
					else{
						var id = video._result.video.id;
						var has = false;

						for(var i = 0; i < list.length; i++)
							if(list[i]._result.video.id == id){
								has = true;

								break;
							}
						if(!has)
							list.splice(0, 0, video);
						callbacks.playlist(list);
					}
				};

				yt.playlist(match.playlist.id, this.playlistLimit, (err, data) => {
					if(err || data.end){
						if(vd)
							finish();
						pd = true;

						return;
					}

					if(!list){
						callbacks.configure('playlist');

						list = [];
					}

					for(var i = 0; i < data.length; i++){
						var item = this._makeItem(data[i]);

						if(!item[0])
							list.push(item[1]);
					}
				});

				this.media(match.video.id, function(err, data){
					if(!err)
						video = data;
					if(pd)
						finish();
					vd = true;
				});
			}else{
				callbacks.configure('playlist');

				this.playlist(match.playlist.id, this.playlistLimit, function(err, data){
					if(err)
						callbacks.error(err);
					else
						callbacks.playlist(data);
				});
			}

			return;
		}if(match.video){
			callbacks.configure('media');

			this.media(match.video.id, function(err, data){
				if(err)
					callbacks.error(err);
				else
					callbacks.media(data);
			});
		}else if(match.idMatch)
			this.media(match.idMatch.id, (err, data) => {
				if(err){
					callbacks.configure('search');

					this.search(args, function(err, data){
						if(err)
							callbacks.error(err);
						else
							callbacks.search(data);
					});
				}else{
					callbacks.configure('media');
					callbacks.media(data);
				}
			});
	}

	media(args, callback){
		yt.get(args, (err, data) => {
			if(err)
				return callback(err, null);
			var item = this._makeItem(data);

			if(item[0])
				return callback(item[0], null);
			callback(null, item[1]);
		});
	}

	search(args, callback){
		yt.search(args, (err, data) => {
			if(err)
				return callback(err, null);
			for(var i = 0; i < data.length; i++){
				var item = this._makeItem(data[i]);

				if(item[0])
					return callback(item[0], null);
				data[i] = item[1];
			}

			callback(null, data);
		});
	}

	playlist(args, limit = this.playlistLimit, callback){
		var results = [];

		yt.playlist(args, limit, (err, data) => {
			if(err)
				return callback(err, null);
			if(data.end)
				return callback(null, results);
			for(var i = 0; i < data.length; i++){
				var item = this._makeItem(data[i]);

				if(!item[0])
					results.push(item[1]);
			}
		});
	}

	discriminator(d, callbacks){
		if(d[1] == 'v'){
			callbacks.configure('media');

			this.media(d[2], function(err, data){
				if(err)
					callbacks.error(err);
				else
					callbacks.media(data);
			});
		}else if(d[1] == 'p'){
			callbacks.configure('playlist');

			this.playlist(d[2], function(err, data){
				if(err)
					callbacks.error(err);
				else
					callbacks.playlist(data);
			});
		}
	}
}

module.exports = new sourceYT();