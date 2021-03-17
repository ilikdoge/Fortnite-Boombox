const copy = require('bindings')('natives').util.copy;

class FrameSize{
	constructor(buffersize){
		this.buffersize = buffersize;
		this.offset = 0;
		this.buffer = new Float32Array(buffersize);
	}

	process(buffer, len = buffer.length){
		var ret = [];
		var off = 0;

		while(off < len){
			var copied = copy(buffer, this.buffer, off, this.offset, len, this.buffersize);

			off += copied;

			this.offset += copied;

			if(this.offset >= this.buffersize){
				ret.push(this.buffer);

				this.buffer = new Float32Array(this.buffersize);
				this.offset = 0;
			}
		}

		return ret;
	}

	reset(){
		this.offset = 0;
	}
}

module.exports = FrameSize;