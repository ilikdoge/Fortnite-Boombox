'use-strict';

const Errors = require('../error');

const vorbis = require('bindings')('natives').vorbis;
const decode = vorbis.decode;

const ERROR_CODES = {
	OK: 0,
	OV_EREAD: -128,
	OV_EFAULT: -129,
	OV_EIMPL: -130,
	OV_EINVAL: -131,
	OV_ENOTVORBIS: -132,
	OV_EBADHEADER: -133,
	OV_EVERSION: -134,
	OV_ENOTAUDIO: -135,
	OV_EBADPACKET: -136,
	OV_EBADLINK: -137,
	OV_ENOSEEK: -138
};

for(var i in ERROR_CODES)
	ERROR_CODES[ERROR_CODES[i]] = i;

function getErrorMessage(code){
	if(code == ERROR_CODES.OK)
		return null;
	return Errors.gen_api_error(ERROR_CODES[code], code);
}

class Decoder{
	constructor(){
		this.instance = decode.create();
		this.output = {error: null, data: null, sample_rate: 0, channel_count: 0, frame_size: 0};
	}

	configure(config){
		var err = decode.configure(this.instance, config);

		if(err != ERROR_CODES.OK)
			return getErrorMessage(err);
		var info = decode.getInfo(this.instance);


		this.output.sample_rate = info.sampleRate;
		this.output.channel_count = info.channels;
		this.buffer = new Float32Array(info.channels * 8192);

		return null;
	}

	decode(data, offset, length){
		var err = decode.decode(this.instance, data, offset, length, this.buffer);

		if(err >= 0){
			this.output.data = err > 0 ? new Float32Array(this.buffer.buffer, 0, err * this.output.channel_count) : null;//fix
			this.output.frame_size = err;
		}else
			this.output.error = getErrorMessage(err);
		return this.output;
	}

	destroy(){
		decode.destroy(this.instance);
	}
}

module.exports = {Decoder};