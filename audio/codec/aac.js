"use-strict";

const Errors = require('../error');
const ERROR_CODES = {
	AAC_DEC_OK: 0x0000,
	AAC_DEC_OUT_OF_MEMORY: 0x0002,
	AAC_DEC_UNKNOWN: 0x0005,
	aac_dec_sync_error_start: 0x1000,
	AAC_DEC_TRANSPORT_SYNC_ERROR: 0x1001,
	AAC_DEC_NOT_ENOUGH_BITS: 0x1002,
	aac_dec_sync_error_end: 0x1FFF,
	aac_dec_init_error_start: 0x2000,
	AAC_DEC_INVALID_HANDLE: 0x2001,
	AAC_DEC_UNSUPPORTED_AOT: 0x2002,
	AAC_DEC_UNSUPPORTED_FORMAT: 0x2003,
	AAC_DEC_UNSUPPORTED_ER_FORMAT: 0x2004,
	AAC_DEC_UNSUPPORTED_EPCONFIG: 0x2005,
	AAC_DEC_UNSUPPORTED_MULTILAYER: 0x2006,
	AAC_DEC_UNSUPPORTED_CHANNELCONFIG: 0x2007,
	AAC_DEC_UNSUPPORTED_SAMPLINGRATE: 0x2008,
	AAC_DEC_INVALID_SBR_CONFIG: 0x2009,
	AAC_DEC_SET_PARAM_FAIL: 0x200A,
	AAC_DEC_NEED_TO_RESTART: 0x200B,
	AAC_DEC_OUTPUT_BUFFER_TOO_SMALL: 0x200C,
	aac_dec_init_error_end: 0x2FFF,
	aac_dec_decode_error_start: 0x4000,
	AAC_DEC_TRANSPORT_ERROR: 0x4001,
	AAC_DEC_PARSE_ERROR: 0x4002,
	AAC_DEC_UNSUPPORTED_EXTENSION_PAYLOAD: 0x4003,
	AAC_DEC_DECODE_FRAME_ERROR: 0x4004,
	AAC_DEC_CRC_ERROR: 0x4005,
	AAC_DEC_INVALID_CODE_BOOK: 0x4006,
	AAC_DEC_UNSUPPORTED_PREDICTION: 0x4007,
	AAC_DEC_UNSUPPORTED_CCE: 0x4008,
	AAC_DEC_UNSUPPORTED_LFE: 0x4009,
	AAC_DEC_UNSUPPORTED_GAIN_CONTROL_DATA: 0x400A,
	AAC_DEC_UNSUPPORTED_SBA: 0x400B,
	AAC_DEC_TNS_READ_ERROR: 0x400C,
	AAC_DEC_RVLC_ERROR: 0x400D,
	aac_dec_decode_error_end: 0x4FFF,
	aac_dec_anc_data_error_start: 0x8000,
	AAC_DEC_ANC_DATA_ERROR: 0x8001,
	AAC_DEC_TOO_SMALL_ANC_BUFFER: 0x8002,
	AAC_DEC_TOO_MANY_ANC_ELEMENTS: 0x8003,
	aac_dec_anc_data_error_end: 0x8FFF
};

for(var i in ERROR_CODES)
	ERROR_CODES[ERROR_CODES[i]] = i;

function getErrorMessage(code){
	if(code == ERROR_CODES.AAC_DEC_OK)
		return null;
	return Errors.gen_api_error(ERROR_CODES[code], code);
}

const aac = require('bindings')('natives').aac;
const decode = aac.decode;

const zeroBuffer = new Float32Array(0);

class Decoder{
	constructor(){
		this.instance = decode.create();
		this.output = {error: null, data: null, sample_rate: 0, channel_count: 0, frame_size: 0};
		this.buffer = zeroBuffer;
	}

	fill(buffer, start, length){
		var status = decode.fill(this.instance, buffer, start, length);

		return getErrorMessage(status);
	}

	decode(){
		var status = decode.decode(this.instance, this.buffer);

		if(status == ERROR_CODES.AAC_DEC_OK)
			this.output.data = this.buffer;
		else if(status == ERROR_CODES.AAC_DEC_NOT_ENOUGH_BITS)
			this.output.data = null;
		else
			this.output.error = getErrorMessage(status);
		return this.output;
	}

	getInfo(){
		this.decode();

		if(this.output.error == getErrorMessage(0x200c))
			this.output.error = null;
		else
			return null;
		var info = decode.getInfo(this.instance);

		if(info.channels && info.frameSize && info.sampleRate){
			this.output.sample_rate = info.sampleRate;
			this.output.channel_count = info.channels;
			this.output.frame_size = info.frameSize;
			this.buffer = new Float32Array(info.channels * info.frameSize);

			return info;
		}

		return null;
	}

	configure(frequency, channels){
		var status = decode.configure(this.instance, frequency, channels);

		return getErrorMessage(status);
	}

	configure_custom(bytes){
		var status = decode.configure_custom(this.instance, bytes);

		return getErrorMessage(status);
	}

	destroy(){
		decode.destroy(this.instance);
	}
}

module.exports = {Decoder};