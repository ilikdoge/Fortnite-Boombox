module.exports = {
	UNEXPECTED_READ_END: 		'UNEXPECTED_READ_END: The stream ended before the required amount of bytes was read (code 0x0001)',
	UNKNOWN_ERROR: 				'ERROR: Error unknown or internal error',

	SEEK_INFO_LOADING: 			'CANNOT_SEEK: Seek out of bounds while seek points still loading (code 0x1001)',

	UNEXPECTED_ELEMENT: 		'BAD_MEDIA_FILE: Error when parsing media data, possibly corrupt file (code 0x2001)',
	MISSING_TRACK_DATA: 		'BAD_MEDIA_FILE: Error when parsing media data or stream ended before data could be received (code 0x2002)',

	/* isom errors */
	TRACK_NOT_IN_MOOF: 			'BAD_MEDIA_FILE: Error when parsing media data, possibly corrupt file (code 0x3001)',
	TRACK_SAMPLE_DATA_UNKNOWN: 	'BAD_MEDIA_FILE: Error when parsing media data, possibly corrupt file (code 0x3002)',
	/* mkv errors */
	EBML_WRONG_FORMAT: 			'BAD_MEDIA_FILE: Error when parsing media data, not a media file (code 0x3003)',
	BAD_CLUSTER: 				'BAD_MEDIA_FILE: Error when parsing media data, possibly a corrupt file (code 0x3004)',
	/* ogg errors */
	BAD_PAGE: 					'BAD_MEDIA_FILE: Error when parsing media data, possibly a corrupt file (code 0x4001)',

	gen_api_error(name, code){
		code = ' (code 0x' + Math.abs(code).toString(16) + ')';

		if(name)
			return 'INTERNAL_ERROR: ' + name + code;
		return this.UNKNOWN_ERROR + code;
	},

	/* http errors */
	gen_http_error(code){
		return 'BAD_HTTP_STATUS: Resource no longer available (code 0x' + code.toString(16) + ')';
	},

	NO_CONTENT_RANGE: 			'HTTP_CONTENT_RANGE_UNSUPPORTED: Could not get the resource within a range (code 0x0002)',
	BAD_CONTENT_RANGE:			'HTTP_BAD_CONTENT_RANGE: Returned content range does not match requested range (code 0x0003)'
};