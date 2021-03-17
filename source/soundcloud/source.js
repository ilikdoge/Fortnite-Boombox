const MediaItem = require('../../common/mediaitem');
const sc = require('./api');

class itemSC extends MediaItem{
	constructor(result){
		super(null);

		var urlparse = this._parse(result.permaurl);

		this.discriminator = ['sc', urlparse.path];
		this.sourceurl = result.permaurl;
		this.setPublisher(result.publisher.name, result.publisher.icon);
		this.setMetadata(result.metadata.title, result.metadata.thumbnail);
		this.setDuration(result.metadata.duration, 0);
		this._result = result;

		delete result.publisher;
		delete result.metadata;
		delete result.permaurl;
	}

	_getUrlStream(callback){
		this._result.streams = null;
		this._result.getStreams((err, data) => {
			if(err)
				return callback(err, null);
			this.url = data.hlsopus || data.httpmp3 || data.hlsmp3;

			delete this._result.streams;

			callback(null, this.url);
		});
	}

	fetch(callback){
		this._getUrlStream((err) => {
			callback(err);
		});
	}

	_parse(url){
		return sourceSC.prototype._parse.apply(null, [url]);
	}
}

class sourceSC{
	constructor(){}

	_parse(url){
		var result = /^https?:\/\/soundcloud\.com\/([a-zA-Z0-9:_-]+)\/(sets\/)?([a-zA-Z0-9:_-]+)/.exec(url);

		if(result){
			var path = result[1] + '/' + (result[2] ? result[2] : '') + result[3];

			return {url: 'https://soundcloud.com/' + path, path: path};
		}

		return null;
	}

	matches(args){
		return this._parse(args) ? true : false;
	}

	get(args, callbacks){
		var result = this._parse(args);

		if(!result){
			callbacks.configure('search');

			return this.search(args, 20, function(err, data){
				if(err)
					callbacks.error(err);
				else
					callbacks.search(data);
			});
		}

		sc.get(result.url, (err, data) => {
			if(err)
				return callbacks.error(err);
			if(data.playlist){
				callbacks.configure('playlist');

				for(var i = 0; i < data.playlist.length; i++)
					data.playlist[i] = new itemSC(data.playlist[i]);
				callbacks.playlist(data.playlist);
			}else if(data.track){
				callbacks.configure('media');
				callbacks.media(new itemSC(data.track));
			}
		});
	}

	search(args, limit, callback){
		sc.search(args, limit, (err, data) => {
			if(err)
				return callback(err, null);
			for(var i = 0; i < data.length; i++)
				data[i] = new itemSC(data[i]);
			callback(null, data);
		});
	}

	discriminator(d, cbs){
		this.get('https://soundcloud.com/' + d[1], cbs);
	}
}

module.exports = new sourceSC();