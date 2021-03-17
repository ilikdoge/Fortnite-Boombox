'use-strict';

const StreamReader = require('./StreamReader');
const {Readable} = require('stream');
const request = require('request');

const Errors = require('../error');

class HttpSeekableStream extends Readable{
	constructor(file, start, end){
		super();

		this.file = file;
		this.start = start;
		this.end = end;
		this.create(start, end);
	}

	create(start, end){
		if(this.stream){
			this.stream.aborted = true;
			this.stream.abort();
			this.stream = null;
		}

		if(start > end)
			return this.push(null);
		var stream = this.stream = request({url: this.file.url, headers: {range: 'bytes=' + (start ? start : '0') + '-' + (end ? end : '')}, gzip: true});

		this.stream.on('response', (resp) => {
			if(resp.statusCode < 200 || resp.statusCode >= 400){
				stream.abort();

				if(resp.statusCode == 416)
					this.push(null);
				else
					this.emit('error', new Error(Errors.gen_http_error(resp.statusCode)));
			}else{
				this.file.url = resp.request.uri.href;

				var content_range = /^bytes ([0-9]+?)-([0-9]*?)\/([0-9]*|\*)$/.exec(resp.headers['content-range']);

				if(!content_range){
					stream.abort();

					return this.emit('error', new Error(Errors.NO_CONTENT_RANGE));
				}

				if(content_range[1] != start || (end && content_range[2] != end)){
					stream.abort();

					return this.emit('error', new Error(Errors.BAD_CONTENT_RANGE));
				}

				this.file.content_length = content_range[3] ? parseInt(content_range[3], 10) : null;
			}
		});

		this.stream.on('data', (buffer) => {
			this.push(buffer);
		});

		this.stream.on('error', (err) => {
			stream.abort();

			this.emit('error', err);
		});

		this.stream.on('end', () => {
			if(!stream.aborted)
				this.push(null);
		});
	}

	seek(start){
		this.create(start, this.end);
	}

	_destroy(){
		this.stream.abort();
	}

	_read(){}
}

class FileProvider{
	constructor(url){
		this.url = url;
		this.content_length = null;
	}

	read(start, end){
		var sr = new StreamReader(new HttpSeekableStream(this, start, end));

		sr.position = start;

		return sr;
	}
}

module.exports = FileProvider;
