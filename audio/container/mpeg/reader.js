'use-strict';

const parser = require('./parser');
const MpegFragmentedDataHandler = require('./fragmented');
const MpegStandardDataHandler = require('./standard');

const ERR_MISSING_TRACKS = 'missing track information';
const ERR_MISSING_SEEK_INFO = 'missing seek information';
const ERR_UNEXPECTED_BOX_AFTER_MOOF = 'unexpected box after moof';
const ERR_UNEXPECTED_END_AFTER_MOOF = 'unexpected stream end after moof';

class MpegReader{
	constructor(streamReader, cb){
		this.reader = streamReader;
		this.cb = cb;
		this.readNextBox();
	}

	handleBox(box, cb){
		if(box.type == 'moov' || box.type == 'sidx' || (!this.sidx && box.type == 'moof'))
			return this.parse(box, cb);
		if(box.type == 'mdat' || (this.sidx && box.type == 'moof'))
			return cb(this.skip(box));
		cb(this.ignore(box));
	}

	parse(box, cb){
		this.reader.read(box.size > 0 ? box.size - 8 : 0, (reader) => {
			if(reader){
				if(box.type == 'moov')
					this.tracks = parser.parseMovieBox(reader);
				else if(box.type == 'sidx')
					this.sidx = parser.parseSegmentIndex(reader);
				else if(box.type == 'moof'){
					var m = parser.parseMovieFragmentBox(reader);

					m.begin = reader.range.begin - 8;
					m.end = reader.range.end;

					this.reader.read(8, (reader) => {
						if(!reader){
							this.error = ERR_UNEXPECTED_END_AFTER_MOOF;

							return cb(false);
						}

						var size = reader.readUint32();
						var type = reader.readString(4);

						if(type != 'mdat'){
							this.error = ERR_UNEXPECTED_BOX_AFTER_MOOF;

							return cb(false);
						}

						if(size > 0)
							m.data_end = size + reader.range.begin;
						this.moofs = [m];

						cb(false);
					});

					return;
				}
			}else
				return cb(false);
			if(box.size > 0)
				cb(true);
		});
	}

	skip(box){
		if(this.tracks){
			if(this.tracks.fragmented){
				if(this.sidx)
					return false;
			}else
				return false;
		}

		if(this.sidx){
			var sidx = this.sidx;

			this.reader.seek(sidx.segments[sidx.segments.length - 1].byte.end);
		}else
			return this.ignore(box);
	}

	ignore(box){
		if(box.size > 0){
			this.reader.seek(box.range[1]);

			return true;
		}

		return false;
	}

	readNextBox(){
		this.reader.read(8, (reader) => {
			if(reader){
				var size = reader.readUint32();
				var type = reader.readString(4);

				this.handleBox({size, type: type, range: [reader.range.begin, reader.range.begin + size]}, (cont) => {
					if(cont)
						this.readNextBox();
					else
						this.finish();
				});
			}else
				this.finish();
		});
	}

	finish(){
		this.reader.destroy();

		if(this.error)
			this.cb(this.error, null);
		else if(this.tracks){
			if(this.tracks.fragmented){
				if(this.sidx || this.moofs)
					this.cb(null, {tracks: this.tracks, sidx: this.sidx, moofs: this.moofs, createHandler(file, track){
						return new MpegFragmentedDataHandler(file, track, this.sidx, this.moofs);
					}});
				else
					this.cb(ERR_MISSING_SEEK_INFO, null);
			}else
				this.cb(null, {tracks: this.tracks, createHandler(file, track){
					return new MpegStandardDataHandler(file, track);
				}});
		}else
			this.cb(ERR_MISSING_TRACKS);
	}
}

module.exports = {
	probe(stream, cb){
		stream.ghostRead(8, (reader) => {
			cb(this.probe_sync(reader));
		});
	}, probe_sync(reader){
		reader.skip(4);

		return reader.readString(4) == "ftyp";
	}, read(stream, cb){
		new MpegReader(stream, cb);
	}, PROBE_BYTES_REQUIRED: 8
};