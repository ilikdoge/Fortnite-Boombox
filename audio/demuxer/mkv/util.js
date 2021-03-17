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

module.exports.sync = {readVint(reader, signed){
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

	return unknown ? 0 : (signed ? number - vsint_subtr[bytes - 1] : number);
}, reduceToInt(array, signed){
	var number = array[0];
	var subtr = 0;

	if(signed && number >> 7){
		subtr = 0x80 * (0x100 ** (array.length - 1));
		number = number & 0x7F;
	}

	for(var i = 1; i < array.length; i++)
		number = number * 256 + array[i];
	return number - subtr;
}, convert};

module.exports.async = {readVint(sreader, signed, cb){
	sreader.read(1, (err, reader) => {
		if(err)
			return cb(err);
		if(!reader)
			return cb(null, null);
		var first = reader.readUint8();
		var bytes = leadingZeros(first) + 1;

		var number = first & (0xFF >>> bytes);
		var unknown = number == 0xFF >>> bytes;

		if(bytes - 1 > 0)
			sreader.read(bytes - 1, (err, reader) => {
				if(err)
					return cb(err);
				if(!reader)
					return cb(null, null);
				for(var i = 0; i < bytes - 1; i++){
					var val = reader.readUint8();

					number = (number * 256) + val;

					if(unknown && val != 0xFF)
						unknown = false;
				}

				cb(null, unknown ? 0 : (signed ? number - vsint_subtr[bytes - 1] : number), bytes);
			});
		else
			cb(null, unknown ? 0 : (signed ? number - vsint_subtr[0] : number), 1);
	});
}};

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
	Cluster: convert(0x1f43b675),
	ClusterTimeCode: convert(0xe7),
	ClusterPosition: convert(0xa7),
	ClusterSimpleBlock: convert(0xa3),
	ClusterBlockGroup: convert(0xa0),
	ClusterBlockGroupBlock: convert(0xa1),
	ClusterBlockGroupReferenceBlock: convert(0xfb),
	ClusterBlockGroupBlockDuration: convert(0x9b)
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