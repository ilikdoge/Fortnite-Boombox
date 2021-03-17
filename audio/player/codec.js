const Aac = require('../codec/aac');
const Opus = require('../codec/opus');
const Vorbis = require('../codec/vorbis');

class AacDecoderWrapper{
	constructor(frequency, channels, custom){
		this.decoder = new Aac.Decoder();

		var error = custom ? this.decoder.configure_custom(custom) : this.decoder.configure(frequency, channels);

		if(error)
			throw new Error(error);
	}

	process(buffer, offset, len){
		if(this.decoder.fill(buffer, offset, len))
			return this.decoder.output;
		if(!this.decoder.buffer.byteLength){
			if(!this.decoder.getInfo())
				return {error: "No decoder info", data: null};
			else
				return this.decoder.output;
		}else
			return this.decoder.decode();
	}

	get_frame_size(buffer, offset, len){
		return this.decoder.output.frame_size;
	}

	destroy(){
		this.decoder.destroy();
	}
}

class OpusDecoderWrapper{
	constructor(frequency, channels){
		this.decoder = new Opus.Decoder(frequency, channels);
	}

	process(buffer, offset, len){
		return this.decoder.decode(buffer, offset, len);
	}

	getSampleInfo(buffer, offset, len){
		return this.decoder.getSampleInfo(buffer, offset, len);
	}

	destroy(){
		this.decoder.destroy();
	}
}

class OpusEncoderWrapper{
	constructor(frequency, channels){
		this.encoder = new Opus.Encoder(Opus.Encoder.OPUS_AUDIO, frequency, channels, 10);
	}

	process(pcm, frameSize, bitrate){
		return this.encoder.encode(pcm, frameSize, bitrate);
	}

	destroy(){
		this.encoder.destroy();
	}
}

class VorbisDecoderWrapper{
	constructor(frequency, channels, custom){
		this.decoder = new Vorbis.Decoder(custom);

		var err = this.decoder.configure(custom);

		if(err)
			throw new Error(err);
	}

	process(buffer, offset, length){
		return this.decoder.decode(buffer, offset, length);
	}

	destroy(){
		this.decoder.destroy();
	}
}

const codecs = {};

var aac = {Decoder: AacDecoderWrapper};
var opus = {Decoder: OpusDecoderWrapper, Encoder: OpusEncoderWrapper};
var vorbis = {Decoder: VorbisDecoderWrapper};

codecs["aac"] = aac;
codecs["opus"] = opus;
codecs["vorbis"] = vorbis;

module.exports = {
	codecs,

	from_codec(codec){
		return codecs[codec];
	}, register(alias, name){
		codecs[alias] = codecs[name];
	}
};