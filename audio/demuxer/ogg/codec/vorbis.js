"use-strict";

class VorbisHandler{
	constructor(packet){
		this.identification = packet.reset();
		this.comment = null;
		this.setup = null;
		this.start_page = null;
	}

	process(page, packet){
		var type = packet.readUint8();

		if(packet.readString(6) != 'vorbis'){
			this.start_page = page;

			return true;
		}

		if(type == 1)
			return true;
		else if(type == 3){
			if(this.comment)
				return true;
			this.comment = packet.reset();
		}else if(type == 5){
			if(this.setup)
				return true;
			this.setup = packet.reset();
		}else{
			this.start_page = page;

			return true;
		}

		return false;
	}

	get ready(){
		return this.identification && this.setup && this.start_page ? true : false;
	}

	gen_track(){
		var reader = this.identification;

		reader.skip(11);

		var channel_count = reader.readUint8();
		var sample_rate = reader.readUint32(true);

		reader.reset();

		var config = new Uint8Array(2 + Math.ceil((reader.bytesLeft + 1) / 255) + reader.bytesLeft + this.setup.bytesLeft);

		config[0] = 2;

		var size = reader.bytesLeft;
		var offset = 1;

		while(size >= 0){
			config[offset++] = size > 255 ? 255 : size;
			size -= 255;
		}

		config[offset++] = 0;

		var ident = reader.reset().read(reader.bytesLeft);

		config.set(ident, offset);
		config.set(this.setup.read(this.setup.bytesLeft), offset + ident.byteLength);

		return {codec: 'vorbis', type: 'audio', channel_count, sample_rate, timescale: sample_rate, codec_configure: config, handler: this};
	}

	granule_position(track, pos){
		return pos;
	}
}

VorbisHandler.match = function(reader){
	if(reader.bytesLeft < 30)
		return false;
	if(reader.readUint8() != 1)//header_type
		return false;
	if(reader.readString(6) != 'vorbis')
		return false;
	if(reader.readUint8() != 0)//vorbis_version
		return false;
	return true;
};

module.exports = VorbisHandler;