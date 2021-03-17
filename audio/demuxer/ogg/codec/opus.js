class OpusHandler{
	constructor(packet){
		this.head = packet.reset();
		this.tags = null;
		this.start_page = null;
	}

	process(page, packet){
		var type = packet.readString(8);

		if(type == "OpusHead")
			return true;
		else if(type == "OpusTags"){
			if(this.tags)
				return true;
			this.tags = packet.reset();
		}else{
			this.start_page = page;

			return true;
		}

		return false;
	}

	get ready(){
		return this.start_page ? true : false;
	}

	gen_track(){
		var reader = this.head;

		reader.skip(9);

		var channel_count = reader.readUint8();
		var pre_skip = reader.readUint16(true);
		var sample_rate = reader.readUint32(true);

		reader.reset();

		return {codec: 'opus', type: 'audio', channel_count, sample_rate, timescale: sample_rate, pre_skip, handler: this};
	}

	granule_position(track, pos){
		return pos - track.pre_skip;
	}
}

OpusHandler.match = function(reader){
	if(reader.bytesLeft < 19)
		return false;
	if(reader.readString(8) != 'OpusHead')
		return false;
	if(reader.readUint8() > 15)//version
		return false;
	return true;
};

module.exports = OpusHandler;