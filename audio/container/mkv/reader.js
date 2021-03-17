'use-strict';

const util = require('./util');
const parser = require('./parser');
const MKVDataHandler = require('./handler');

const ERR_WRONG_FORMAT = "wrong format";
const ERR_MISSING_TRACKS = "missing tracks";

class MatroskaReader{
	constructor(streamReader, cb){
		this.reader = streamReader;
		this.cb = cb;
		this.readNextElement();
	}

	handleElement(element, cb){
		if(element.id == util.MatroskaID.EBMLHeader || element.id == util.MatroskaID.SegmentInfo ||
			element.id == util.MatroskaID.Tracks || element.id == util.MatroskaID.SeekHead ||
			element.id == util.MatroskaID.Cues)
				this.parse(element, cb);
		else if(element.id == util.MatroskaID.Segment){
			this.segment_byte_offset = element.range[1] - element.size;
			this.bytesRemain = element.size;

			cb(true);
		}else if(element.id == util.MatroskaID.Cluster){
			this.first_cluster_offset = element.range[0];

			this.getMissingElements(() => {
				cb(false);
			});
		}else
			cb(this.ignore(element));
	}

	getMissingElements(cb){
		if(this.seeks){
			if(!this.tracks && this.seeks[util.MatroskaID.Tracks]){
				this.reader.seek(this.seeks[util.MatroskaID.Tracks][0] + this.segment_byte_offset);
				this.readElement((el) => {
					if(!el || el.id != util.MatroskaID.Tracks)
						cb();
					else
						this.parse(el, () => {
							this.getMissingElements(cb);
						});
				});
			}else if(!this.cues && this.seeks[util.MatroskaID.Cues]){
				this.reader.seek(this.seeks[util.MatroskaID.Cues][0] + this.segment_byte_offset);
				this.readElement((el) => {
					if(!el || el.id != util.MatroskaID.Cues)
						cb();
					else
						this.parse(el, () => {
							this.getMissingElements(cb);
						});
				});
			}else
				cb();
		}else
			cb();
	}

	parse(element, cb){
		this.reader.read(element.size, (reader) => {
			if(this.bytesRemain)
				this.bytesRemain -= element.size;
			if(reader){
				if(element.id == util.MatroskaID.EBMLHeader){
					var header = parser.parseEBMLHeader(reader);

					if(header.docType != "matroska" && header.docType != "webm"){
						this.error = ERR_WRONG_FORMAT;

						return cb(false);
					}
				}else if(element.id == util.MatroskaID.SegmentInfo)
					this.segment_info = parser.parseSegmentInfo(reader);
				else if(element.id == util.MatroskaID.Tracks)
					this.tracks = parser.parseTracks(reader);
				else if(element.id == util.MatroskaID.SeekHead)
					this.seeks = parser.parseSeekHead(reader);
				else if(element.id == util.MatroskaID.Cues)
					this.cues = parser.parseCues(reader);
			}else
				return cb(false);
			if(element.size > 0)
				cb(true);
		});
	}

	ignore(element){
		if(element.size > 0){
			if(this.bytesRemain)
				this.bytesRemain -= element.size;
			this.reader.seek(element.range[1]);

			return true;
		}

		return false;
	}

	readElement(cb){
		var pos = this.reader.position;

		util.async.asyncReadVint(this.reader, (id, id_read) => {
			if(id === null)
				cb(null);
			else
				util.async.asyncReadVint(this.reader, (size, size_read) => {
					if(size === null)
						cb(null);
					else{
						if(this.bytesRemain)
							this.bytesRemain -= id_read + size_read;
						cb({id, size, range: [pos, pos + id_read + size_read + size]});
					}
				});
		});
	}

	readNextElement(){
		if(this.bytesRemain <= 0)
			return this.finish();
		this.readElement((el) => {
			if(!el)
				this.finish();
			else{
				this.handleElement(el, (cont) => {
					if(cont)
						this.readNextElement();
					else
						this.finish();
				});
			}
		});
	}

	finish(){
		if(this.error)
			return this.cb(this.error);
		if(this.tracks && this.first_cluster_offset)
			this.cb(null, {tracks: this.tracks, cues: this.cues,
				info: {segment_byte_offset: this.segment_byte_offset, first_cluster_offset: this.first_cluster_offset,
				duration: this.segment_info ? this.segment_info.duration : null, timescale: this.segment_info ? this.segment_info.timecode_scale : 1000000},
				createHandler(file, track){
					return new MKVDataHandler(file, track, this.info, this.cues);
				}
			});
		else
			this.cb(ERR_MISSING_TRACKS);
	}
}

module.exports = {
	probe(stream, cb){
		stream.ghostRead(8, (reader) => {
			cb(this.probe_sync(reader));
		});
	}, probe_sync(reader){
		return util.sync.readVint(reader) == util.MatroskaID.EBMLHeader;
	}, read(stream, cb){
		new MatroskaReader(stream, cb);
	}, PROBE_BYTES_REQUIRED: 8
};