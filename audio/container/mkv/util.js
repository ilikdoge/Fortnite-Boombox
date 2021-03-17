const vsint_subtr = [0x3F, 0x1FFF, 0x0FFFFF, 0x07FFFFFF, 0x03FFFFFFFF, 0x01FFFFFFFFFF, 0x00FFFFFFFFFFFF, 0x007FFFFFFFFFFFFF];

function leadingZeros(byte){
	for(var i = 7; i >= 0; i--)
		if((byte >> i) & 1)
			return 7 - i;
	return 8;
}

function convert(num){
	var v = 2 ** 51;
	for(var i = 51; i >= 0; i--){
		if(num & v)
			return num - v;
		v /= 2;
	}

	return 0;
}

function readVint(reader){
	var first = reader.readUint8();
	var bytes = leadingZeros(first) + 1;

	var number = first & (0xFF >>> bytes);
	var unknown = number == 0xFF >>> bytes;

	for(var i = 0; i < bytes - 1; i++){
		var val = reader.readUint8();

		number = (number * 256) + val;

		if(unknown && val != 0xFF)
			unknown = false;
	}

	return unknown ? 0 : number;
}

function readVSint(reader){
	var first = reader.readUint8();
	var bytes = leadingZeros(first) + 1;

	var number = first & (0xFF >>> bytes);
	var unknown = number == 0xFF >>> bytes;

	for(var i = 0; i < bytes - 1; i++){
		var val = reader.readUint8();

		number = (number * 256) + val;

		if(unknown && val != 0xFF)
			unknown = false;
	}

	return unknown ? 0 : number - vsint_subtr[bytes - 1];
}

function reduceToInt(array){
	var number = array[0];

	for(var i = 1; i < array.length; i++)
		number = number * 256 + array[i];
	return number;
}

module.exports.sync = {readVint, readVSint, reduceToInt, convert};

function asyncReadVint(sreader, cb){
	sreader.read(1, (reader) => {
		if(!reader)
			return cb(null);
		var first = reader.readUint8();
		var bytes = leadingZeros(first) + 1;

		var number = first & (0xFF >>> bytes);
		var unknown = number == 0xFF >>> bytes;

		if(bytes - 1 > 0)
			sreader.read(bytes - 1, (reader) => {
				if(!reader)
					return cb(null);
				for(var i = 0; i < bytes - 1; i++){
					var val = reader.readUint8();

					number = (number * 256) + val;

					if(unknown && val != 0xFF)
						unknown = false;
				}

				cb(unknown ? 0 : number, bytes);
			});
		else
			cb(unknown ? 0 : number, 1);
	});
}

function asyncReadVSint(sreader, cb){
	sreader.read(1, (reader) => {
		if(!reader)
			return cb(null);
		var first = reader.readUint8();
		var bytes = leadingZeros(first) + 1;

		var number = first & (0xFF >>> bytes);
		var unknown = number == 0xFF >>> bytes;

		if(bytes - 1 > 0)
			sreader.read(bytes - 1, (reader) => {
				if(!reader)
					return cb(null);
				for(var i = 0; i < bytes - 1; i++){
					var val = reader.readUint8();

					number = (number * 256) + val;

					if(unknown && val != 0xFF)
						unknown = false;
				}

				cb(unknown ? 0 : number - vsint_subtr[bytes - 1], bytes);
			});
		else
			cb(unknown ? 0 : number - vsint_subtr[0], 1);
	});
}

module.exports.async = {asyncReadVint, asyncReadVSint};
module.exports.MatroskaID = {
	EBMLHeader: convert(0x1a45dfa3),
	EBMLVersion: convert(0x4286),
	// EBMLReadVersion: convert(0x42f7),
	// EBMLMaxIDLength: convert(0x42f2),
	// EBMLMaxSizeLength: convert(0x42f3),
	EBMLDocType: convert(0x4282),
	EBMLDocTypeVersion: convert(0x4287),
	// EBMLDocTypeReadVersion: convert(0x4285),

	Segment: convert(0x18538067),
	SegmentInfo: convert(0x1549a966),
	SegmentInfoTimecodeScale: convert(0x2ad7b1),
	SegmentInfoDuration: convert(0x4489),

	SeekHead: convert(0x114d9b74),
	Seek: convert(0x4dbb),
	SeekID: convert(0x53ab),
	SeekPosition: convert(0x53ac),

	Tracks: convert(0x1654ae6b),
	TrackEntry: convert(0xae),
	TrackNumber: convert(0xd7),
	TrackUID: convert(0x73c5),
	TrackType: convert(0x83),
	TrackEnabled: convert(0xb9),
	TrackDefaultDuration: convert(0x23e383),
	TrackTimecodeScale: convert(0x23314f),
	TrackCodecID: convert(0x86),
	TrackCodecPrivate: convert(0x63A2),
	// TrackCodecName: convert(0x258688),

	TrackAudio: convert(0xe1),
	TrackAudioSamplingFrequency: convert(0xb5),
	TrackAudioOutputSamplingFrequency: convert(0x78b5),
	TrackContentEncodings: convert(0x6d80),
	TrackAttachmentLink: convert(0x7446),
	TrackAudioChannels: convert(0x9f),
	TrackAudioBitDepth: convert(0x6264),

	Cues: convert(0x1c53bb6b),
	CuePoint: convert(0xbb),
	CueTime: convert(0xb3),
	CueTrackPosition: convert(0xb7),
	CueTrack: convert(0xf7),
	CueClusterPosition: convert(0xf1),
	// CueBlockNumber: convert(0x5378),
	Cluster: convert(0x1f43b675)
};

module.exports.TrackType = {
	1: 'video',
	2: 'audio',
	3: 'complex',
	0x10: 'logo',
	0x11: 'subtitle',
	0x12: 'button',
	0x20: 'control'
};