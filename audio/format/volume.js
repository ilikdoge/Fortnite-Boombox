'use-strict';

const volume = require('bindings')('natives').util.volume;

module.exports = function(pcm, gain, len = pcm.length){
	volume(pcm, gain, len);

	return pcm;
};