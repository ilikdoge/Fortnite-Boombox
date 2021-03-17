"use-strict";

const EventEmitter = require('../../util/EventEmitter');

const OggPacketReader = require('./packet');
const OggSampleProvider = require('./sample');

class OggDataHandler extends EventEmitter{
	constructor(file, track){
		super();

		this.file = file;
		this.track = track;
		this.handler = track.handler;
		this.data_start = this.handler.start_page.range.start;
		this.serial_number = this.handler.start_page.serial_number;
		this.duration = 0;
		this.reader = new OggPacketReader(null);
	}

	processNext(min_duration = 0, cb){
		min_duration *= this.track.timescale;

		var stream = this.file.read(this.data_start);

		this.reader.stream = stream;

		var proc = () => {
			this.reader.readPagePackets(this.serial_number, (err, page, packets) => {
				if(err || !page){
					stream.destroy();

					return cb(err, null);
				}

				var samples = new OggSampleProvider();

				for(var i = 0; i < packets.length; i++){
					var packet = packets[i];

					samples.add(packet.read(packet.bytesLeft));
				}

				this.reader.readPage(this.serial_number, (err, npage) => {
					if(err){
						stream.destroy();

						return cb(err, null);
					}

					if(npage){
						this.data_start = npage.range.data_start;

						var duration = npage.granule_position - page.granule_position;

						samples.duration = duration;
						min_duration -= duration;

						cb(null, {time_offset: this.handler.granule_position(this.track, page.granule_position), samples}, min_duration <= 0);

						if(min_duration <= 0)
							stream.destroy();
						else
							proc();
					}else{
						if(packets.length)
							cb(null, {time_offset: this.handler.granule_position(this.track, page.granule_position), samples}, false);
						cb(null, null, true);

						stream.destroy();
					}
				});
			});
		};

		proc();

		return {
			abort(){
				stream.destroy();
			}
		};
	}

	seek(time){

	}

	destroy(){}
}

module.exports = OggDataHandler;