'use-strict';

const littleEndian = (function(){
	var u8 = new Uint8Array(2);

	u8[1] = 1;

	var u16 = new Uint16Array(u8.buffer);

	return u16[0] != u8[1];
})();

var uint8 = new Uint8Array(8);
var int8 = new Int8Array(uint8.buffer);
var uint16 = new Uint16Array(uint8.buffer);
var int16 = new Int16Array(uint8.buffer);
var uint32 = new Uint32Array(uint8.buffer);
var int32 = new Int32Array(uint8.buffer);
var int64 = new BigInt64Array(uint8.buffer);
var uint64 = new BigUint64Array(uint8.buffer);
var float32 = new Float32Array(uint8.buffer);
var float64 = new Float64Array(uint8.buffer);

class Reader{
	constructor(buffers, begin, range){
		this.buffer = 0;
		this.buffers = buffers;
		this.offset = begin;
		this.range = range;
		this.bytesLeft = range.length;
		this.bytesRead = 0;
		this.initial = {bytesLeft: this.bytesLeft, offset: begin, buffer: 0};
	}

	overflow(){
		var cur = this.buffers[this.buffer];

		while(this.offset >= cur.byteLength){
			this.offset -= cur.byteLength;

			cur = this.buffers[++this.buffer];

			if(this.offset == 0)
				break;
		}

		while(this.offset < 0){
			this.offset += cur.byteLength;

			cur = this.buffers[--this.buffer];
		}
	}

	read(len){
		if(len){
			var data = new Uint8Array(len);

			this.readToBuffer(data, 0, len);

			return data;
		}else{
			this.bytesLeft--;
			this.bytesRead++;

			var byte = this.buffers[this.buffer][this.offset++];

			this.overflow();

			return byte;
		}
	}

	readToBuffer(buffer, offset = 0, len = buffer.length - offset){
		for(var i = 0; i < len; ){
			var buf = this.buffers[this.buffer];
			var remain = buf.byteLength - this.offset;

			if(i < len && remain > 0){
				var read = Math.min(len - i, remain);

				buffer.set(new Uint8Array(buf.buffer, this.offset + buf.byteOffset, read), i + offset);
				remain -= read;
				i += read;

				this.offset += read;
			}

			if(remain <= 0)
				this.offset -= this.buffers[this.buffer++].byteLength;
		}

		this.bytesRead += len;
		this.bytesLeft -= len;
	}

	_readToInternalBuffer(buffer, offset, length, reverse){
		if(!reverse)
			return this.readToBuffer(buffer, offset, length);
		for(var i = 0; i < length; ){
			var buf = this.buffers[this.buffer];
			var remain = buf.byteLength - this.offset;

			while(i < length && remain > 0){
				buffer[offset + length - 1 - (i++)] = buf[this.offset++];
				remain--;
			}

			if(remain <= 0)
				this.offset -= this.buffers[this.buffer++].byteLength;
		}

		this.bytesLeft -= length;
		this.bytesRead += length;
	}

	readUint8(){
		return this.read();
	}

	readUint16(reverse){
		this._readToInternalBuffer(uint8, 0, 2, littleEndian ^ reverse);

		return uint16[0];
	}

	readUint24(reverse){
		var d = this.read(3);

		return reverse ? d[0] + (d[1] << 8) + (d[2] << 16) : (d[0] << 16) + (d[1] << 8) + d[2];
	}

	readUint32(reverse){
		this._readToInternalBuffer(uint8, 0, 4, littleEndian ^ reverse);

		return uint32[0];
	}

	readUint64(reverse){
		this._readToInternalBuffer(uint8, 0, 8, littleEndian ^ reverse);

		return Number(uint64[0]);
	}

	readFloat32(reverse){
		this._readToInternalBuffer(uint8, 0, 4, littleEndian ^ reverse);

		return float32[0];
	}

	readFloat64(reverse){
		this._readToInternalBuffer(uint8, 0, 8, littleEndian ^ reverse);

		return float64[0];
	}

	readInt8(){
		uint8[0] = this.readUint8();

		return int8[0];
	}

	readInt16(reverse){
		this.readUint16(reverse);

		return int16[0];
	}

	readInt24(reverse){
		var n = this.readUint24(reverse);
		var b = 1 << 23;

		if(n & b)
			n = n - b << 1;
		return n;
	}

	readInt32(reverse){
		this.readUint32(reverse);

		return int32[0];
	}

	readInt64(reverse){
		this.readUint64(reverse);

		return Number(int64[0]);
	}

	readString(length){
		if(length)
			return String.fromCharCode.apply(null, this.read(length));
		return "";
	}

	skip(bytes){
		this.offset += bytes;
		this.bytesLeft -= bytes;

		this.overflow();
	}

	reader(bytes){
		var begin = this.range.begin + this.bytesRead;

		var r = new Reader(this.buffers, this.offset, {begin: begin, end: begin + bytes, length: bytes});

		r.buffer = this.buffer;
		r.initial.buffer = this.buffer;

		this.skip(bytes);

		return r;
	}

	reset(){
		this.bytesLeft = this.initial.bytesLeft;
		this.offset = this.initial.offset;
		this.buffer = this.initial.buffer;

		return this;
	}
}

const HARD_SEEK_THRESHOLD = 65536;

class StreamReader{
	constructor(stream){
		this.stream = stream;

		this.bytesRead = 0;
		this.bytesReceived = 0;
		this.position = 0;

		this.waiting = [];
		this.data = [];

		this.dataLength = 0;
		this.dataOffset = 0;

		this.hard_seek_threshold = HARD_SEEK_THRESHOLD;

		this.destroyed = false;
		this.id = Date.now();

		stream.on('data', (buffer) => {
			this.push(buffer);
		});

		stream.on('end', () => {
			this.end();
		});

		stream.on('error', (err) => {
			this.end(err);
		});
	}

	push(buffer){
		this.data.push(buffer);
		this.dataLength += buffer.byteLength;
		this.bytesReceived += buffer.byteLength;
		this.check();
	}

	check(){
		while(this.waiting.length){
			var w = this.waiting[0];

			if(w.len > 0 && this.dataLength - this.dataOffset >= w.len){
				this.waiting.shift();

				var offset = this.dataOffset;

				if(!w.ghost){
					this.dataOffset += w.len;

					var buf = this.data[0];
					var buffers = [buf];

					while(this.dataOffset >= buf.byteLength){
						this.dataOffset -= buf.byteLength;
						this.dataLength -= buf.byteLength;
						this.data.shift();

						buf = this.data[0];

						if(this.dataOffset > 0)
							buffers.push(buf);
						else
							break;
					}

					var begin = this.position;

					this.position += w.len;
					this.bytesRead += w.len;

					if(w.cb)
						w.cb(null, new Reader(buffers, offset, {begin, end: this.position, length: w.len}));
				}else{
					var dataOffset = this.dataOffset + w.len;

					var i = 0;
					var buf = this.data[i];
					var buffers = [buf];

					while(dataOffset >= buf.byteLength){
						dataOffset -= buf.byteLength;
						buf = this.data[i++];

						if(dataOffset > 0)
							buffers.push(buf);
						else
							break;
					}

					var begin = this.position;
					var end = begin + w.len;

					w.cb(null, new Reader(buffers, offset, {begin, end, length: w.len}));
				}
			}else
				break;
		}
	}

	read(len, cb){
		if(this.destroyed)
			return cb(null);
		this.waiting.push({len, cb});
		this.check();
	}

	ghostRead(len, cb){
		this.waiting.push({len, cb, ghost: true});
		this.check();
	}

	end(err){
		if(this.destroyed)
			return;
		this.check();

		for(var i = 0; i < this.waiting.length; i++){
			var w = this.waiting[i];
			var curbytes = this.dataLength - this.dataOffset;

			if(w.len == 0 && curbytes > 0){
				var begin = this.position;

				this.position += curbytes;
				this.bytesRead += curbytes;

				if(w.cb)
					w.bc(null, new Reader(this.data, this.dataOffset, {begin: begin, end: this.position, length: this.dataLength}));
				this.dataLength = 0;
			}else if(this.waiting[i].cb)
				this.waiting[i].cb(err, null);
		}

		this.destroy();
	}

	seek(pos){
		if(pos == this.position)
			return;
		if(pos > this.position && pos - this.position < this.dataLength - this.dataOffset + this.hard_seek_threshold){
			this.read(pos - this.position, () => {
				this.position = pos;
			});

			this.position = pos;
		}else{
			this.stream.seek(pos);
			this.data = [];
			this.dataLength = 0;
			this.dataOffset = 0;
			this.position = pos;
		}
	}

	destroy(){
		this.destroyed = true;
		this.stream.destroy();
		this.data = null;
		this.dataLength = null;
		this.dataOffset = null;
		this.waiting = [];
	}
}

StreamReader.DataReader = Reader;

module.exports = StreamReader;