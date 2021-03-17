class OggSampleProvider{
	constructor(){
		this.cur = 0;
		this.packets = [];
		this.duration = 0;
	}

	add(packet){
		this.packets.push(packet);
	}

	next(cb){
		var packet = this.packets[this.cur];

		cb(packet, 0, packet.byteLength);

		this.cur++;
	}

	reset(){
		this.cur = 0;
	}

	seek(/* absolute_time */){
		this.reset();

		return 0;
	}

	get end(){
		return this.cur >= this.packets.length;
	}
}

module.exports = OggSampleProvider;