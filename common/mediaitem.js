'use-strict';

class MediaItem{
	constructor(url){
		this.url = url;
		this.setPublisher();
		this.setMetadata();
		this.setDuration();
	}

	setPublisher(name, icon){
		this.publisher = {name, icon};
	}

	setMetadata(title, thumbnail){
		this.media = {title, thumbnail};
	}

	setDuration(seconds, precision){
		this.duration = {seconds, precision};
	}
};

module.exports = MediaItem;