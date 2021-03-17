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
								id = util.sync.readVint(reader);
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
								track.codec_private = reader.read(reader.bytesLeft);
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

					this.handleElements(reader, [
						{id: util.MatroskaID.CueTime,
							callback(reader){
								cue_time = util.sync.reduceToInt(reader.read(reader.bytesLeft));
							}
						}, {id: util.MatroskaID.CueTrackPosition,
							callback(reader){
								var cue_tracks = [];
								var cue_positions = [];

								this.handleElements(reader, [
									{id: util.MatroskaID.CueTrack,
										callback(reader){
											cue_tracks.push(util.sync.reduceToInt(reader.read(reader.bytesLeft)));
										}
									}, {id: util.MatroskaID.CueClusterPosition,
										callback(reader){
											cue_positions.push(util.sync.reduceToInt(reader.read(reader.bytesLeft)));
										}
									}/*, {id: util.MatroskaID.CueBlockNumber,
										callback(reader){

										}
									}*/
								]);

								if(cue_tracks.length == cue_positions.length)
									for(var i = 0; i < cue_tracks.length; i++)
										cue_track_positions[cue_tracks[i]] = cue_positions[i];
							}
						}
					]);

					if(cue_time !== null && cue_track_positions.length)
						cues.push({cue_time, cue_track_positions});
				}
			}
		]);

		return cues;
	}

	nextElement(reader){
		return {id: util.sync.readVint(reader), size: util.sync.readVint(reader)};
	}

	handleElements(reader, handlers){
		var el = {};

		while(reader.bytesLeft){
			var id = util.sync.readVint(reader);
			var size = util.sync.readVint(reader);

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
}

module.exports = new MatroskaParser();