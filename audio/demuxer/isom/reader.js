'use-strict';

const parser = require('./parser');
const ISOMFragmentedDataHandler = require('./fragmented');
const ISOMStandardDataHandler = require('./standard');
const Codec = require('../../player/codec');

const Errors = require('../../error');

class ISOMReader{
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
		this.reader.read(box.size > 0 ? box.size - 8 : 0, (err, reader) => {
			if(err)
				return this.finish(err);
			if(reader){
				if(box.type == 'moov')
					this.tracks = parser.parseMovieBox(reader);
				else if(box.type == 'sidx')
					this.sidx = parser.parseSegmentIndex(reader);
				else if(box.type == 'moof'){
					var m = parser.parseMovieFragmentBox(reader);

					m.begin = reader.range.begin - 8;
					m.end = reader.range.end;

					this.reader.read(8, (err, reader) => {
						if(err)
							return this.finish(err);
						if(!reader)
							return this.finish(new Error(Errors.UNEXPECTED_READ_END));
						var size = reader.readUint32();
						var type = reader.readString(4);

						if(type != 'mdat')
							return this.finish(new Error(Errors.UNEXPECTED_ELEMENT));
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

			this.reader.seek(sidx.byte[sidx.segments.length]);
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
		this.reader.read(8, (err, reader) => {
			if(err)
				return this.finish(err);
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

	finish(err){
		this.reader.destroy();

		if(err)
			this.cb(err, null);
		else if(this.tracks){
			if(this.tracks.fragmented){
				if(this.sidx || this.moofs)
					this.cb(null, {tracks: this.tracks, sidx: this.sidx, moofs: this.moofs, createHandler(file, track){
						return new ISOMFragmentedDataHandler(file, track, this.sidx, this.moofs);
					}});
				else
					this.cb(new Error(Errors.MISSING_TRACK_DATA), null);
			}else
				this.cb(null, {tracks: this.tracks, createHandler(file, track){
					return new ISOMStandardDataHandler(file, track);
				}});
		}else
			this.cb(new Error(Errors.MISSING_TRACK_DATA), null);
	}
}

Codec.register('mp4a', 'aac');

module.exports = {
	probe(stream, cb){
		stream.ghostRead(8, (err, reader) => {
			if(err || !reader)
				return cb(false);
			cb(this.probe_sync(reader));
		});
	}, probe_sync(reader){
		reader.skip(4);

		return reader.readString(4) == "ftyp";
	}, read(stream, cb){
		new ISOMReader(stream, cb);
	}, PROBE_BYTES_REQUIRED: 8
};