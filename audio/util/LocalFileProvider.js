'use-strict';

const StreamReader = require('./StreamReader');
const {Readable} = require('stream');
const fs = require('fs');

class FileSeekableStream extends Readable{
	constructor(path, start, end){
		super();

		this.path = path;
		this.start = start;
		this.end = end;
		this.create(start, end);
	}

	create(start, end){
		if(this.stream)
			this.stream.destroy();
		if(start > end)
			return this.push(null);
		this.stream = fs.createReadStream(this.path, {start, end});
		this.stream.on('data', (buffer) => {
			this.push(buffer);
		});

		this.stream.on('end', () => {
			this.push(null);
		});
	}

	seek(start){
		this.create(start, this.end);
	}

	_destroy(){
		this.stream.destroy();
	}

	_read(){}
}

class FileProvider{
	constructor(path){
		this.path = path;
	}

	read(start, end){
		var sr = new StreamReader(new FileSeekableStream(this.path, start, end));

		sr.position = start;

		return sr;
	}
}

module.exports = FileProvider;