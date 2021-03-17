'use-strict';

const util = require('./util');

class MatroskaParser{
	constructor(){}

	parseEBMLHeader(reader){
		var docType = "matroska";
		var ebmlVersion = 1;
		var docVersion = 1;

		this.handleElements(reader, [
			{id: util.MatroskaID.EBMLDocType,
				callback(reader){
					docType = reader.readString(reader.bytesLeft);
				}
			}, {id: util.MatroskaID.EBMLVersion,
				callback(reader){
					ebmlVersion = util.sync.reduceToInt(reader.read(reader.bytesLeft));
				}
			}, {id: util.MatroskaID.EBMLDocTypeVersion,
				callback(reader){
					docVersion = util.sync.reduceToInt(reader.read(reader.bytesLeft));
				}
			}
		]);

		return {ebmlVersion, docType, docVersion};
	}

	parseSegmentInfo(reader){
		var duration = null;
		var timecode_scale = null;

		this.handleElements(reader, [
			{id: util.MatroskaID.SegmentInfoDuration,
				callback(reader){
					if(reader.bytesLeft == 4)
						duration = reader.readFloat32();
					else if(reader.bytesLeft == 8)
						duration = reader.readFloat64();
				}
			}, {id: util.MatroskaID.SegmentInfoTimecodeScale,
				callback(reader){
					timecode_scale = util.sync.reduceToInt(reader.read(reader.bytesLeft));
				}
			}
		]);

		return {duration, timecode_scale};
	}

	parseSeekHead(reader){
		var seeks = {};

		this.handleElements(reader, [
			{id: util.MatroskaID.Seek,
				callback(reader){
					var id = null;
					var position = null;

					this.handleElements(reader, [
						{id: util.MatroskaID.SeekID,
							callback(reader){
								id = util.sync.readVint(reader, false);
							}
						}, {id: util.MatroskaID.SeekPosition,
							callback(reader){
								position = util.sync.reduceToInt(reader.read(reader.bytesLeft));
							}
						}
					]);

					if(id !== null && position !== null)
						if(seeks[id])
							seeks[id].push(position);
						else
							seeks[id] = [position];
				}
			}
		]);

		return seeks;
	}

	parseTracks(reader){
		var tracks = {};

		this.handleElements(reader, [
			{id: util.MatroskaID.TrackEntry,
				callback(reader){
					var track = {};

					this.handleElements(reader, [
						{id: util.MatroskaID.TrackNumber,
							callback(reader){
								track.number = util.sync.reduceToInt(reader.read(reader.bytesLeft));
							}
						}, {id: util.MatroskaID.TrackUID,
							callback(reader){
								track.uid = util.sync.reduceToInt(reader.read(reader.bytesLeft));
							}
						}, {id: util.MatroskaID.TrackType,
							callback(reader){
								track.type = util.TrackType[util.sync.reduceToInt(reader.read(reader.bytesLeft))];
							}
						}, {id: util.MatroskaID.TrackDefaultDuration,
							callback(reader){
								track.default_duration = util.sync.reduceToInt(reader.read(reader.bytesLeft));
							}
						}, {id: util.MatroskaID.TrackTimecodeScale,
							callback(reader){
								track.timecode_scale = util.sync.reduceToInt(reader.read(reader.bytesLeft));
							}
						}, {id: util.MatroskaID.TrackCodecID,
							callback(reader){
								track.codec = reader.readString(reader.bytesLeft);
							}
						}, {id: util.MatroskaID.TrackCodecPrivate,
							callback(reader){
								track.codec_configure = reader.read(reader.bytesLeft);
							}
						}, {id: util.MatroskaID.TrackAudio,
							callback(reader){
								var sampling_frequency = 8000;
								var output_frequency = 8000;
								var channels = 1;
								var bit_depth = null;

								this.handleElements(reader, [
									{id: util.MatroskaID.TrackAudioSamplingFrequency,
										callback(reader){
											if(reader.bytesLeft == 4)
												sampling_frequency = reader.readFloat32();
											else if(reader.bytesLeft == 8)
												sampling_frequency = reader.readFloat64();
											output_frequency = sampling_frequency;
										}
									}, {id: util.MatroskaID.TrackAudioOutputSamplingFrequency,
										callback(reader){
											if(reader.bytesLeft == 4)
												output_frequency = reader.readFloat32();
											else if(reader.bytesLeft == 8)
												output_frequency = reader.readFloat64();
										}
									}, {id: util.MatroskaID.TrackAudioChannels,
										callback(reader){
											channels = util.sync.reduceToInt(reader.read(reader.bytesLeft));
										}
									}, {id: util.MatroskaID.TrackAudioBitDepth,
										callback(reader){
											bit_depth = util.sync.reduceToInt(reader.read(reader.bytesLeft));
										}
									}
								]);

								track.sample_rate = sampling_frequency;
								track.output_frequency = output_frequency;
								track.channel_count = channels;
								track.bit_depth = bit_depth;
							}
						}, {id: util.MatroskaID.TrackContentEncodings,
							callback(){
								track.has_content_encoding = true;
							}
						}, {id: util.MatroskaID.TrackAttachmentLink,
							callback(){
								track.has_attachment = true;
							}
						}
					]);

					if(track.number && track.type && track.codec)
						tracks[track.number] = track;
					//else invalid track
				}
			}
		]);

		return tracks;
	}

	parseCues(reader){
		var cues = [];

		this.handleElements(reader, [
			{id: util.MatroskaID.CuePoint,
				callback(reader){
					var cue_time = null;
					var cue_track_positions = {};
					var has_position = false;

					this.handleElements(reader, [
						{id: util.MatroskaID.CueTime,
							callback(reader){
								cue_time = util.sync.reduceToInt(reader.read(reader.bytesLeft));
							}
						}, {id: util.MatroskaID.CueTrackPosition,
							callback(reader){
								var cur_track = null;

								var handlers = {};

								handlers[util.MatroskaID.CueTrack] = function(reader){
									cur_track = util.sync.reduceToInt(reader.read(reader.bytesLeft));
								};

								handlers[util.MatroskaID.CueClusterPosition] = function(reader){
									if(!cur_track)
										return false;
									cue_track_positions[cur_track] = util.sync.reduceToInt(reader.read(reader.bytesLeft));
									cur_track = null;
									has_position = true;
								};

								this.handleElementsNativeOrder(reader, handlers);
							}
						}
					]);

					if(cue_time !== null && has_position)
						cues.push({cue_time, cue_track_positions});
				}
			}
		]);

		return cues;
	}

	parseCluster(reader){
		var timecode = null;
		var position = null;
		var blocks = [];

		var handlers = {};

		handlers[util.MatroskaID.ClusterTimeCode] = function(reader){
			timecode = util.sync.reduceToInt(reader.read(reader.bytesLeft));
		};

		handlers[util.MatroskaID.ClusterPosition] = function(reader){
			position = util.sync.reduceToInt(reader.read(reader.bytesLeft));
		};

		handlers[util.MatroskaID.ClusterBlockGroup] = function(reader){
			// var references = [];

			this.handleElements(reader, [
				{id: util.MatroskaID.ClusterBlockGroupBlock,
					callback(reader){
						blocks.push(reader);
					}
				}/*, {id: util.MatroskaID.ClusterBlockGroupBlockDuration,
					callback(reader){
						duration = util.sync.reduceToInt(reader.read(reader.bytesLeft), true);
					}
				}/*, {id: util.MatroskaID.ClusterBlockGroupReferenceBlock,
					callback(reader){
						references.push(util.sync.reduceToInt(reader.read(reader.bytesLeft), true));
					}
				}*/
			]);
		};

		handlers[util.MatroskaID.ClusterSimpleBlock] = function(reader){
			blocks.push(reader);
		}

		this.handleElementsNativeOrder(reader, handlers);

		return {timecode, position, blocks};
	}

	parseBlock(reader){
		var track = util.sync.readVint(reader, false);
		var timecode = reader.readInt16();
		var flags = reader.readUint8();

		var key_frame = (flags & 0x80) == 0x80;
		var lacing = (flags & 0x6) >> 1;
		var samples = {};
		var frame_count = 1;

		if(lacing){
			frame_count = reader.readUint8() + 1;

			if(lacing == 2){
				samples.default = Math.floor(reader.bytesLeft / frame_count);
				samples.total = reader.bytesLeft;
			}else{
				var sizes = new Uint16Array(frame_count);
				var total = 0;

				if(lacing == 1){
					var cur_frame = 0;
					var last_size = 0;

					while(cur_frame < frame_count - 1){
						var size = reader.readUint8();

						last_size += size;

						if(size < 255){
							sizes[cur_frame] = last_size;
							last_size = 0;
							cur_frame++;
							total += last_size;
						}
					}
				}else if(lacing == 3){
					sizes[0] = util.sync.readVint(reader);

					total = sizes[0];

					for(var i = 1; i < frame_count - 1; i++){
						sizes[i] = util.sync.readVint(reader, true) - sizes[i - 1];
						total += sizes[i];
					}
				}

				samples.total = reader.bytesLeft;
				sizes[frame_count - 1] = samples.total - total;
				samples.entries = sizes;
			}
		}else{
			samples.default = reader.bytesLeft;
			samples.total = reader.bytesLeft;
		}

		samples.frame_count = frame_count;

		return {track, timecode, key_frame, samples, data: reader.read(reader.bytesLeft)};
	}

	nextElement(reader){
		return {id: util.sync.readVint(reader, false), size: util.sync.readVint(reader, false)};
	}

	handleElements(reader, handlers){
		var el = {};

		while(reader.bytesLeft){
			var id = util.sync.readVint(reader, false);
			var size = util.sync.readVint(reader, false);

			if(size == 0)
				size = reader.bytesLeft;
			var r = reader.reader(size);

			if(el[id])
				el[id].push(r);
			else
				el[id] = [r];
		}

		for(var i = 0; i < handlers.length; i++){
			var handler = handlers[i];
			var elements = el[handler.id];

			if(elements){
				var proc = handler.callback;

				for(var j = 0; j < elements.length; j++)
					proc.apply(this, [elements[j]]);
			}
		}
	}

	handleElementsNativeOrder(reader, handlers){
		while(reader.bytesLeft){
			var id = util.sync.readVint(reader, false);
			var size = util.sync.readVint(reader, false);

			if(size == 0)
				size = reader.bytesLeft;
			if(handlers[id]){
				if(handlers[id].apply(this, [reader.reader(size)]) === false)
					return;
			}else
				reader.skip(size);
		}
	}
}

module.exports = new MatroskaParser();