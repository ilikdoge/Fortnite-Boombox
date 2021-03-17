'use-strict';

class MKVSampleProvder{
	constructor(){
		this.cur = 0;
		this.cur_block_frame = 0;
		this.cur_block_frame_offset = 0;
		this.blocks = [];
		this.duration = 0;
	}

	add(block){
		this.blocks.push(block);
		this.duration = block.timecode; /* safe duration */
	}

	next(cb){
		var block = this.blocks[this.cur];

		var size = null;

		if(block.samples.default)
			size = block.samples.default;
		else
			size = block.samples.entries[this.cur_block_frame];
		cb(block.data, this.cur_block_frame_offset, size);

		if(++this.cur_block_frame < block.samples.frame_count)
			this.cur_block_frame_offset += size;
		else{
			this.cur++;
			this.cur_block_frame = 0;
			this.cur_block_frame_offset = 0;
		}
	}

	reset(){
		this.cur = 0;
		this.cur_block_frame = 0;
		this.cur_block_frame_offset = 0;
	}

	seek(absolute_time){
		var l = 0;
		var r = this.blocks.length - 1;

		while(l < r){
			var mid = Math.floor((l + r + 1) / 2);

			if(this.blocks[mid].timecode > absolute_time)
				r = mid - 1;
			else
				l = mid;
		}

		this.reset();

		while(l > 0 && !this.blocks[l].key_frame)
			l--;
		this.cur = l;

		return this.blocks[this.cur].timecode;
	}

	get end(){
		return this.cur >= this.blocks.length;
	}
}

module.exports = MKVSampleProvder;