"use-strict";

const Reader = require('../../util/StreamReader').DataReader;
const Errors = require('../../error');

class OggPacketReader{
	constructor(stream){
		this.stream = stream;
		this.page = null;
		this.incompletePackets = {};
	}

	readPage(serial = null, cb){
		this.stream.read(27, (err, reader) => {
			if(err)
				return cb(err, null);
			if(!reader || reader.readString(4) != 'OggS'){
				this.page = null;

				return cb(null, null);
			}

			if(reader.readUint8() != 0){
				this.page = null;

				return cb(new Error(Errors.BAD_PAGE), null);
			}

			var header_type_flag = reader.readUint8();

			var is_continued = (header_type_flag & 0x1) == 1;
			var is_first = (header_type_flag & 0x2) == 2;
			var is_last = (header_type_flag & 0x4) == 4;

			var granule_position = reader.readInt64(true);
			var serial_number = reader.readInt32(true);

			var sequence = reader.readInt32(true);

			reader.skip(4);//checksum

			var segments = reader.readUint8();
			var sizes = new Uint8Array(segments);
			var total_size = 0;
			var start = reader.range.begin;

			this.stream.read(segments, (err, reader) => {
				if(err)
					return cb(err);
				if(!reader){
					this.page = null;

					return cb(new Error(Errors.UNEXPECTED_READ_END), null);
				}

				for(var i = 0; i < segments; i++){
					sizes[i] = reader.readUint8();
					total_size += sizes[i];
				}

				var page = {
					flags: {
						is_continued,
						is_first,
						is_last
					},

					granule_position, serial_number, sequence, sizes,
					range: {
						start,
						end: start + total_size + segments + 27,
						data_start: start + segments + 27},
					total_size
				};

				this.page = page;

				if(serial !== null && page.serial_number != serial){
					this.skip(page);
					this.page = null;

					return this.readPage(serial, cb);
				}

				cb(null, page);
			});
		});
	}

	readPacket(serial = null, cb){
		if(!this.page)
			return this.readPage(serial, (err, page) => {
				if(err || !page)
					return cb(err, null);
				this.readPacket(serial, cb);
			});
		else if(serial !== null && this.page.serial_number != serial){
			this.skip(this.page);
			this.page = null;
			this.readPacket(serial, cb);

			return;
		}

		var page = this.page;

		if(!page.segment)
			page.segment = 0;
		var packet_size = 0;
		var ended = false;

		while(page.segment < page.sizes.length){
			var sz = page.sizes[page.segment++];

			packet_size += sz;

			if(sz < 255){
				ended = true;

				break;
			}
		}

		if(page.segment >= page.sizes.length)
			this.page = null;
		if(packet_size == 0)
			return this.readPacket(serial, cb);
		this.stream.read(packet_size, (err, reader) => {
			if(err)
				return cb(err, null);
			if(!reader)
				return cb(new Error(Errors.UNEXPECTED_READ_END), null);
			var buffers = this.incompletePackets[page.serial_number];

			if(ended){
				if(buffers){
					buffers.push(reader.read(reader.bytesLeft));

					var length = 0;

					for(var i = 0; i < buffers.length; i++)
						length += buffers[i].byteLength;
					delete this.incompletePackets[page.serial_number];

					cb(null, page, new Reader(buffers, 0, {length}));
				}else
					cb(null, page, reader);
			}else{
				if(buffers)
					buffers.push(reader.read(reader.bytesLeft));
				else
					this.incompletePackets[page.serial_number] = [reader.read(reader.bytesLeft)];
				this.readPacket(serial, cb);
			}
		});
	}

	readPagePackets(serial = null, cb){
		if(!this.page)
			return this.readPage(serial, (err, page) => {
				if(err || !page)
					return cb(err, null);
				this.readPagePackets(serial, cb);
			});
		else if(serial !== null && this.page.serial_number != serial){
			this.skip(this.page);
			this.page = null;
			this.readPagePackets(serial, cb);

			return;
		}

		var page = this.page;

		if(!page.segment)
			page.segment = 0;

		var prev_seg = page.segment;
		var total_size = 0;

		while(page.segment < page.sizes.length){
			var sz = page.sizes[page.segment++];

			total_size += sz;
		}

		if(!total_size){
			this.page = null;

			return this.readPagePackets(serial, cb);
		}

		page.segment = prev_seg;

		this.stream.read(total_size, (err, reader) => {
			if(err)
				return cb(err, null);
			if(!reader)
				return cb(new Error(Errors.UNEXPECTED_READ_END), null);
			var packet_size = 0;
			var packets = [];
			while(page.segment < page.sizes.length){
				var sz = page.sizes[page.segment++];

				packet_size += sz;

				if(sz < 255 && packet_size > 0){
					var buffers = this.incompletePackets[page.serial_number];

					if(buffers){
						buffers.push(reader.read(packet_size));

						var length = 0;

						for(var i = 0; i < buffers.length; i++)
							length += buffers[i].byteLength;
						delete this.incompletePackets[page.serial_number];

						packets.push(new Reader(buffers, 0, {length}));
					}else
						packets.push(reader.reader(packet_size));
					packet_size = 0;
				}
			}

			if(packet_size > 0){
				var buffers = this.incompletePackets[page.serial_number];

				if(buffers)
					buffers.push(reader.read(packet_size));
				else
					this.incompletePackets[page.serial_number] = [reader.read(packet_size)];
			}

			cb(null, page, packets);
		});

		this.page = null;
	}

	skip(page){
		if(page != this.page)
			return;
		this.stream.seek(page.range.end);
		this.page = null;
	}
}

module.exports = OggPacketReader;