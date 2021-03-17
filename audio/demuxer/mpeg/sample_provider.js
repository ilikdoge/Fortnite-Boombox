'use-strict';

class MpegSampleProvider{
	constructor(data, samples){
		this.cur = 0;
		this.length = samples.sample_count;
		this.duration = samples.duration.total;
		this.sizes = samples.size;
		this.data = data;
		this.offset = 0;
	}

	next(cb){
		var size = this.sizes.default;

		if(this.sizes.entries)
			size = this.sizes.entries[this.cur];
		cb(this.data, this.offset, size);

		this.offset += size;
		this.cur++;
	}

	reset(){
		this.cur = 0;
		this.offset = 0;
	}

	seek(/*absolute_time*/){ /* only the first frame is a key frame, frame skipping isn't allowed */
		this.cur = 0;
		this.offset = 0;

		return 0;
	}

	get end(){
		return this.cur >= this.length;
	}
}

module.exports = MpegSampleProvider;

module.exports = MpegSampleProvider;