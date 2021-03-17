'use-strict';

const OggPacketReader = require('./packet');
const OggDataHandler = require('./handler');

const VorbisHandler = require('./codec/vorbis');
const OpusHandler = require('./codec/opus');

const Errors = require('../../error');

class OggReader{
	constructor(stream, cb){
		this.stream = stream;
		this.cb = cb;
		this.packetReader = new OggPacketReader(stream);
		this.serial_number_ignore = {};
		this.codecs = {};
		this.codec_count = 0;
		this.codecs_ready = 0;
		this.codecs_finished = 0;

		this.readNextPacket();
	}

	readNextPacket(){
		this.packetReader.readPacket(null, (err, page, packet) => {
			if(err || !page)
				return this.finish(err);
			if(this.serial_number_ignore[page.serial_number]){
				this.packetReader.skip(page);

				return this.readNextPacket();
			}

			if(!this.codec_count && (page.sequence > 0 || page.granule_position > 0 ||
				!page.flags.is_first || this.serial_number_ignore[page.serial_number]))
				return this.finish();
			var codec = this.codecs[page.serial_number];

			if(!codec){
				var match = false;

				var handlers = [VorbisHandler, OpusHandler];
				for(var i = 0; i < handlers.length; i++){
					if(handlers[i].match(packet)){
						this.codecs[page.serial_number] = new (handlers[i])(packet);
						this.codec_count++;

						match = true;

						break;
					}

					packet.reset();
				}

				if(!match)
					this.serial_number_ignore[page.serial_number] = true;
			}else{
				var finish = codec.process(page, packet);

				if(finish){
					if(codec.ready)
						this.codecs_ready++;
					this.codecs_finished++;
					this.serial_number_ignore[page.serial_number] = true;

					if(this.codecs_finished == this.codec_count)
						return this.finish();
				}
			}

			this.readNextPacket();
		});
	}

	finish(error){
		this.stream.destroy();

		if(error)
			return this.cb(error);
		if(!this.codec_count || !this.codecs_ready)
			return this.cb(new Error(Errors.MISSING_TRACK_DATA));
		var tracks = {};

		var index = 1;
		for(var i in this.codecs)
			if(this.codecs[i].ready)
				tracks[index++] = this.codecs[i].gen_track();
		this.cb(null, {tracks, createHandler(file, track){
			return new OggDataHandler(file, track);
		}});
	}
}

module.exports = {
	probe(stream, cb){
		stream.ghostRead(4, (err, reader) => {
			if(err || !reader)
				return cb(false);
			cb(this.probe_sync(reader));
		});
	}, probe_sync(reader){
		return reader.readString(4) == 'OggS';
	}, read(stream, cb){
		new OggReader(stream, cb);
	}, PROBE_BYTES_REQUIRED: 4
};