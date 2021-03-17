const request = require('request');
const MediaItem = require('../../common/mediaitem');
const HttpFileProvider = require('../../audio/util/HttpFileProvider');

class URLItem extends MediaItem{
	constructor(url){
		super(url);
		this.discriminator = ['url', url];
	}

	getFile(){
		return new HttpFileProvider(this.url);
	}
};

class sourceURL{
	constructor(){}

	get(url, callbacks){
		request({url: url, method: 'HEAD'}, (err, resp) => {
			if(err)
				return callbacks.error(err);
			if(resp.statusCode < 200 || resp.statusCode >= 400)
				return callbacks.error(new Error('HTTP ' + resp.statusCode));
			var contentType = resp.headers['content-type'];

			if(contentType.match(/(video|audio)\/(.*?)/) || contentType.match(/(.*?)\/octet-stream/))
				callbacks.media(new URLItem(url));
			else
				callbacks.error(new Error('Mime type received is not of video/audio type'));
		});
	}

	matches(args){
		var url = /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b[-a-zA-Z0-9@:%_\+.~#?&//=]*$/.exec(args);

		if(url)
			return true;
		return null;
	}

	discriminator(d, cb){
		return this.get(d[1], cb);
	}
}

module.exports = new sourceURL();