'use-strict';

class ISOMParser{
	constructor(){}

	parseMovieBox(reader){
		var tracks = {};

		this.handleBoxes(reader, [{type: "trak", callback: (reader) => {
			var track = {};

			this.handleBoxes(reader, [
				{type: "tkhd", callback(reader){
					var version = reader.readUint8();

					reader.skip(3); //flags
					reader.skip(version == 0 ? 8 : 16); //creation + modification time

					track.id = reader.readUint32();
				}}, {type: "mdia", callback: (reader) => {
					this.handleBoxes(reader, [
						{type: "hdlr", callback: (reader) => {
							reader.skip(1); //version
							reader.skip(3); //flags
							reader.skip(4); //pre_defined

							track.handler = reader.readString(4);

							if(track.handler == "vide")
								track.type = "video";
							else if(track.handler == "soun")
								track.type = "audio";
						}}, {type: "mdhd", callback(reader){
							var version = reader.readUint8();

							reader.skip(3); //flags
							reader.skip(version == 0 ? 8 : 16); //creation + modification time

							track.timescale = reader.readUint32();
							track.duration = version == 0 ? reader.readUint32() : reader.readUint64();
						}}, {type: "minf", callback: (reader) => {
							this.handleBoxes(reader, [
								{type: "stbl", callback: (reader) => {
									var stbl = {};

									this.handleBoxes(reader, [
										{type: "stts", callback(reader){
											reader.skip(4); //version + flags

											var entry_count = reader.readUint32();
											var sample_count = new Uint32Array(entry_count)
											var sample_delta = new Uint32Array(entry_count);
											var entries = {sample_count, sample_delta, entry_count};

											for(var i = 0; i < entries.entry_count; i++){
												sample_count[i] = reader.readUint32();
												sample_delta[i] = reader.readUint32();
											}

											stbl.sampleTime = entries;
										}}, {type: "stsc", callback(reader){
											reader.skip(4); //version + flags

											var entry_count = reader.readUint32();
											var first_chunk = new Uint32Array(entry_count);
											var samples_per_chunk = new Uint32Array(entry_count);
											var entries = {first_chunk, samples_per_chunk, entry_count};

											for(var i = 0; i < entries.entry_count; i++){
												first_chunk[i] = reader.readUint32();
												samples_per_chunk[i] = reader.readUint32();

												reader.skip(4); //sample_description_index
											}

											stbl.sampleChunk = entries;
										}}, {type: "stsz", callback(reader){
											reader.skip(4); //version + flags

											var sample_size = reader.readUint32();
											var entries = reader.readUint32();

											if(sample_size == 0){
												entries = new Uint32Array(entries);

												for(var i = 0; i < entries.length; i++)
													entries[i] = reader.readUint32();
											}

											stbl.sampleSize = {entries, sample_size};
										}}, {type: "stco", callback(reader){
											reader.skip(4); //version + flags

											var entries = new Uint32Array(reader.readUint32());

											for(var i = 0; i < entries.length; i++)
												entries[i] = reader.readUint32();
											stbl.chunkOffset = entries;
										}}, {type: "co64", callback(reader){
											reader.skip(4); //version + flags

											var entries = new Array(reader.readUint32());

											for(var i = 0; i < entries.length; i++)
												entries[i] = reader.readUint64();
											stbl.chunkOffset = entries;
										}}, {type: "stsd", callback: (reader) => {
											var version = reader.readUint8();

											reader.skip(3); //flags
											reader.skip(4); //entries

											reader.skip(4); //size

											track.codec = reader.readString(4);

											if(track.handler == 'vide'){
												reader.skip(6); //reserved * 6
												reader.skip(2); //data_reference_index
												reader.skip(2); //pre_defined
												reader.skip(2); //reserved
												reader.skip(12); //pre_defined * 3

												track.width = reader.readUint16();
												track.height = reader.readUint16();
												track.horizresolution = reader.readUint16() * (10 ** reader.readInt16());
												track.vertresolution = reader.readUint16() * (10 ** reader.readInt16());

												reader.skip(4); //reserved

												track.frame_count = reader.readUint16();

												var complen = reader.readInt8();

												track.compressorname = reader.readString(complen);

												reader.skip(31 - complen);

												track.depth = reader.readUint16();

												// reader.skip(2); //pre_defined
											}else if(track.handler == 'soun')
												if(version == 0){
													reader.skip(6); //reserved * 6
													reader.skip(2); //data_reference_index
													reader.skip(8); //reserved * 2

													track.channel_count = reader.readUint16();
													track.bit_depth = reader.readUint16();

													reader.skip(2); //pre_defined
													reader.skip(2); //reserved

													track.sample_rate = reader.readUint16() * (10 ** reader.readInt16());
												}else{
													reader.skip(2); //entry_version
													reader.skip(6); //reserved * 3

													track.channel_count = reader.readUint16();
													track.sample_size = reader.readUint16();

													reader.skip(2); //pre_defined
													reader.skip(2); //reserved

													track.sample_rate = reader.readUint16() * (10 ** reader.readInt16());
												}
										}}
									]);

									track.sampleTable = stbl;
								}}
							]);
						}}
					]);
				}}
			]);

			tracks[track.id] = track;
		}}, {type: "mvex", callback: (reader) => {
			this.handleBoxes(reader, [
				{type: "trex", callback: (reader) => {
					tracks.fragmented = true;

					reader.skip(4); //version + flags

					var track_id = reader.readUint32();

					reader.skip(4); //default_sample_description_index

					tracks[track_id].default_sample_duration = reader.readUint32();
					tracks[track_id].default_sample_size = reader.readUint32();

					//reader.skip(4); //default_sample_flags
				}}
			]);
		}}]);

		return tracks;
	}

	parseSegmentIndex(reader){
		var version = reader.readUint8();

		reader.skip(3); //flags
		reader.skip(4); //reference_id

		var timescale = reader.readUint32();
		var first_offset;

		if(version == 0){
			reader.skip(4); //earliest_presentation_time
			first_offset = reader.readUint32();
		}else{
			reader.skip(8); //earliest_presentation_time
			first_offset = reader.readUint64();
		}

		reader.skip(2); //reserved

		var length = reader.readUint16();
		var curbyte = first_offset + reader.range.end;
		var curtime = 0;

		var byte = new Uint32Array(length + 1);
		var time = new Uint32Array(length + 1);

		byte[0] = curbyte;

		for(var i = 0; i < length; i++){
			curbyte += reader.readUint32() & 0x7fffffff;
			curtime += reader.readUint32();

			byte[i + 1] = curbyte;
			time[i + 1] = curtime;

			reader.skip(4); //sap
		}

		return {timescale, time, byte, length};
	}

	parseMovieFragmentBox(reader){
		var len = reader.bytesLeft;
		var tracks = {};

		this.handleBoxes(reader, [
			{type: "traf", callback: (reader) => {
				var track = {};

				this.handleBoxes(reader, [
					{type: "tfdt", callback(reader){
						var version = reader.readUint8();

						reader.skip(3); //flags
						track.base_media_decode_time = version == 0 ? reader.readUint32() : reader.readUint64();
					}}, {type: "tfhd", callback(reader){
						reader.skip(1); //version

						var flags = reader.readUint24();
						var track_id = reader.readUint32();

						track.id = track_id;

						if(flags & 0x1)
							reader.skip(8);//track.base_data_offset = reader.readUint64();
						if(flags & 0x2)
							reader.skip(4); //sample_description_index
						if(flags & 0x8)
							track.default_sample_duration = reader.readUint32();
						if(flags & 0x10)
							track.default_sample_size = reader.readUint32();
						// if(flags & 0x1 == 0 && flags & 0x020000)
						// 	track.base_data_offset = 0;
						// if(flags & 0x20)
						// 	reader.skip(4); //default_sample_flags
					}}, {type: "trun", callback(reader){
						reader.skip(1); //version

						var flags = reader.readUint24();
						var sample_count = reader.readUint32();

						track.samples = sample_count;
						track.data_offset = flags & 1 ? reader.readInt32() : len + 8;

						if(flags & 0x4)
							reader.skip(4); //first_sample_flags
						var samp_dur_pres = flags & 0x100 ? true : false;
						var samp_size_pres = flags & 0x200 ? true : false;
						var samp_flag_pres = flags & 0x400 ? true : false;
						var samp_comp_pres = flags & 0x800 ? true : false;

						var samples = {size: {default: track.default_sample_size, total: 0}, duration: {default: track.default_sample_duration, total: 0}, sample_count};

						if(samp_dur_pres || samp_size_pres){
							var total_size = 0;
							var total_duration = 0;
							var samp_durs = samp_dur_pres ? new Uint32Array(sample_count) : null;
							var samp_size = samp_size_pres ? new Uint32Array(sample_count) : null;

							for(var i = 0; i < sample_count; i++){
								if(samp_dur_pres){
									var dur = reader.readUint32();

									total_duration += dur;
									samp_durs[i] = dur;
								}

								if(samp_size_pres){
									var size  = reader.readUint32();

									total_size += size;
									samp_size[i] = size;
								}

								if(samp_flag_pres)
									reader.skip(4);
								if(samp_comp_pres)
									reader.skip(4);
							}

							if(samp_dur_pres){
								samples.duration.entries = samp_durs;
								samples.duration.total = total_duration;
							}

							if(samp_size_pres){
								samples.size.entries = samp_size;
								samples.size.total = total_size;
							}
						}

						if(!samp_dur_pres)
							samples.duration.total = sample_count * track.default_sample_duration;
						if(!samp_size_pres)
							samples.size.total = sample_count * track.default_sample_size;
						track.samples = samples;
					}}
				]);

				tracks[track.id] = track;
			}}
		]);

		return tracks;
	}

	nextBox(reader){
		return {size: reader.readUint32(), type: reader.readString(4)};
	}

	handleBoxes(reader, handlers){
		var boxes = {};
		while(reader.bytesLeft){
			var size = reader.readUint32();
			var type = reader.readString(4);

			if(size == 0)
				size = reader.bytesLeft + 8;
			var r = reader.reader(size - 8);

			if(boxes[type])
				boxes[type].push(r);
			else
				boxes[type] = [r];
		}

		for(var i = 0; i < handlers.length; i++){
			var handler = handlers[i];
			var box = boxes[handler.type];

			if(box){
				var proc = handler.callback;

				for(var j = 0; j < box.length; j++)
					proc(box[j]);
			}
		}
	}
};

module.exports = new ISOMParser();