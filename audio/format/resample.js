'use-strict';

const resample = require('bindings')('natives').resample;

const QUALITY_SINC_BEST = 0;
const QUALITY_SINC_MEDIUM = 1;
const QUALITY_SINC_FASTEST = 2;
const QUALITY_ZERO_ORDER_HOLD = 3;
const QUALITY_LINEAR = 4;

const Errors = require('../error');

const ERROR_CODES = {
	SRC_ERR_NO_ERROR: 0,
	SRC_ERR_MALLOC_FAILED: 1,
	SRC_ERR_BAD_STATE: 2,
	SRC_ERR_BAD_DATA: 3,
	SRC_ERR_BAD_DATA_PTR: 4,
	SRC_ERR_NO_PRIVATE: 5,
	SRC_ERR_BAD_SRC_RATIO: 6,
	SRC_ERR_BAD_PROC_PTR: 7,
	SRC_ERR_SHIFT_BITS: 8,
	SRC_ERR_FILTER_LEN: 9,
	SRC_ERR_BAD_CONVERTER: 10,
	SRC_ERR_BAD_CHANNEL_COUNT: 11,
	SRC_ERR_SINC_BAD_BUFFER_LEN: 12,
	SRC_ERR_SIZE_INCOMPATIBILITY: 13,
	SRC_ERR_BAD_PRIV_PTR: 14,
	SRC_ERR_BAD_SINC_STATE: 15,
	SRC_ERR_DATA_OVERLAP: 16,
	SRC_ERR_BAD_CALLBACK: 17,
	SRC_ERR_BAD_MODE: 18,
	SRC_ERR_NULL_CALLBACK: 19,
	SRC_ERR_NO_VARIABLE_RATIO: 20,
	SRC_ERR_SINC_PREPARE_DATA_BAD_LEN: 21,
	SRC_ERR_BAD_INTERNAL_STATE: 22,
	SRC_ERR_MAX_ERROR: 23
};

for(var i in ERROR_CODES)
	ERROR_CODES[ERROR_CODES[i]] = i

class Resampler{
	constructor(quality, channels, sourcerate, outputrate){
		this.instance = resample.create(quality, channels); //0, 1, 2, 4 best converter types
		this.sourcerate = sourcerate;
		this.outputrate = outputrate;
		this.buffer = new Float32Array(channels * 4096);

		if(!this.instance)
			throw new Error("resampler create fail");
	}

	process(pcm, cb){
		var inoff = 0;

		while(true){
			var status = resample.convert(this.instance, pcm, inoff, this.buffer, 0, this.sourcerate, this.outputrate);

			if(status.status != ERROR_CODES.SRC_ERR_NO_ERROR)
				return ERROR_CODES[status.status] || Errors.UNKNOWN_ERROR;
			inoff += status.input;

			cb(this.buffer, status.output);

			if(inoff >= pcm.length)
				break;
		}

		return null;
	}

	reset(){
		resample.reset(this.instance);
	}

	destroy(){
		resample.destroy(this.instance);
	}
}

Resampler.QUALITY_SINC_BEST = QUALITY_SINC_BEST;
Resampler.QUALITY_SINC_MEDIUM = QUALITY_SINC_MEDIUM;
Resampler.QUALITY_SINC_FASTEST = QUALITY_SINC_FASTEST;
Resampler.QUALITY_ZERO_ORDER_HOLD = QUALITY_ZERO_ORDER_HOLD;
Resampler.QUALITY_LINEAR = QUALITY_LINEAR;

module.exports = Resampler;