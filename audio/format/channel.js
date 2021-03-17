'use-strict';

const channel = require('bindings')('natives').util.channel;
class Channel{
	constructor(source, target){
		this.source = source;
		this.target = target;
	}

	process(pcm, len = pcm.length){
		return channel(pcm, len, this.source, this.target);
	}
}

module.exports = Channel;