const MediaItem = require('../../common/mediaitem');
const ig = require('./api');
const HttpFileProvider = require('../../audio/util/HttpFileProvider');

class itemIG extends MediaItem{
	constructor(result){
		super(result.url);

		this.setPublisher(result.publisher.name, result.publisher.icon);
		this.setMetadata(result.metadata.title, result.metadata.thumbnail);
		this.setDuration(result.metadata.duration, 0);
		this.discriminator = ['ig', result.id, result.shortcode];
		this._result = result;

		delete result.url;
		delete result.publisher;
		delete result.metadata;
	}

	fetch(callback){
		this._result.url = null;
		this._result.getUrl((err, data) => {
			if(err)
				return callback(err);
			this.url = data;

			delete this._result.url;

			callback(null);
		});
	}

	get sourceurl(){
		return 'https://instagram.com/p/' + this._result.id;
	}

	getItem(){
		return new HttpFileProvider(this.url);
	}
}

class sourceIG{
	constructor(){}

	_parse(url){
		var result = /^https?:\/\/(?:www\.)?instagram\.com\/p\/([a-zA-Z0-9_-]+)/.exec(url);

		return result ? result[1] : null;
	}

	matches(args){
		return this._parse(args) ? true : false;
	}

	get(args, callbacks){
		var id = this._parse(args);

		if(!id)
			return callbacks.error(new Error('No matching url'));
		ig.get(id, (err, data) => {
			if(err)
				return callbacks.error(err);
			if(data.video){
				callbacks.configure('media');
				callbacks.media(new itemIG(data.video));
			}else if(data.collection){
				callbacks.configure('playlist');

				for(var i = 0; i < data.collection.length; i++)
					data.collection[i] = new itemIG(data.collection[i]);
				callbacks.playlist(data.collection);
			}
		});
	}

	discriminator(d, callbacks){
		ig.get(d[1], (err, data) => {
			if(err)
				return callbacks.error(err);
			if(data.video){
				if(data.video.shortcode == this.shortcode){
					callbacks.configure('media');
					callbacks.media(new itemIG(data.collection[i]));
				}else
					callbacks.error(new Error('Video not found'));
			}else if(data.collection){
				for(var i = 0; i < data.collection.length; i++)
					if(data.collection[i].shortcode == this.shortcode){
						callbacks.configure('media');

						return callbacks.media(new itemIG(data.collection[i]));
					}
				callbacks.error(new Error('Video not found'));
			}
		});
	}
}

module.exports = new sourceIG();