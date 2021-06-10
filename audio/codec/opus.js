'use-strict';

const Errors = require('../error');

const opus = require('bindings')('natives').opus;
const encode = opus.encode;

const ERROR_CODES = {
	OPUS_OK: 0,
	OPUS_BAD_ARG: -1,
	OPUS_BUFFER_TOO_SMALL: -2,
	OPUS_INTERNAL_ERROR: -3,
	OPUS_INVALID_PACKET: -4,
	OPUS_UNIMPLEMENTED: -5,
	OPUS_INVALID_STATE: -6,
	OPUS_ALLOC_FAIL: -7
};

for(var i in ERROR_CODES)
	ERROR_CODES[ERROR_CODES[i]] = i;

function getErrorMessage(code){
	if(code == ERROR_CODES.OPUS_OK)
		return null;
	return Errors.gen_api_error(ERROR_CODES[code], code);
}

class Encoder{
	constructor(type, frequency, channels, quality){
		this.instance = encode.create(frequency, channels, type, quality);
		this.buffer = new Uint8Array(7650);

		if(!this.instance)
			throw new Error("opus enc create fail");
		this.frequency = frequency;
		this.output = {error: null, data: null};
	}

	encode(pcm, frameSize, bitrate){
		if(bitrate > 63750)
			throw new RangeError('bitrate too high (max 510kbps)');
		var err = encode.encode(this.instance, frameSize, Math.ceil(bitrate * frameSize / this.frequency), pcm, this.buffer);

		if(err < 0)
			this.output.error = getErrorMessage(status);
		else
			this.output.data = new Uint8Array(this.buffer.buffer, 0, err);
		return this.output;
	}

	destroy(){
		encode.destroy(this.instance);
	}
}

Encoder.OPUS_VOIP = 2048;
Encoder.OPUS_AUDIO = 2049;
Encoder.OPUS_RESTRICTED_LOWDELAY = 2051;

const decode = opus.decode;
class Decoder{
	constructor(frequency, channels){
		this.instance = decode.create(frequency, channels);

		if(!this.instance)
			throw new Error("opus dec create fail");
		this.output = {error: null, data: null, sample_rate: frequency, channel_count: 0, frame_size: 0};
		this.buffer = new Float32Array(11520);
	}

	decode(packet, offset, length){
		var status = decode.decode(this.instance, packet, offset, length, this.buffer, this.output);

		if(status < 0)
			this.output.error = getErrorMessage(status);
		else
			this.output.data = new Float32Array(this.buffer.buffer, 0, status * this.output.channel_count);
		return this.output;
	}

	getSampleInfo(packet, offset, length){
		var si = decode.getSampleInfo(this.instance, packet, offset, length);

		si.sample_rate = this.output.sample_rate;

		return si;
	}

	destroy(){
		decode.destroy(this.instance);
	}
};

module.exports = {Encoder, Decoder};