const {VoiceConnection} = require('discord.js');

const secretbox = require('./SecretBox');

const audio_nonce = Buffer.alloc(24);

/* these bytes never change */
audio_nonce[0] = 0x80;
audio_nonce[1] = 0x78;

const audio_buffer = new Uint8Array(7678);
const nonce_buffer = Buffer.alloc(24);

/**
 * Pipes packets from an AudioPlayer to a VoiceConnection
 */
class StreamDispatcher{
	/**
	 * Creates a StreamDispatcher
	 * @param {VoiceConnection} connection
	 * @param {AudioPlayer} player
	 */
	constructor(connection){
		this.connection = connection;
		this.nonce = 0;

		this.disconnect_handler = this.destroy.bind(this);

		connection.on('disconnect', this.disconnect_handler);
		connection.player.destroyDispatcher();
		connection.player.dispatcher = this;
	}

	/**
	 * @private
	 */
	step(frame){
		const data = this.connection.player.streamingData;

		data.sequence++;

		if(data.sequence > 65535)
			data.sequence = 0;
		data.timestamp += frame.frame_size;

		if(data.timestamp > 4294967295)
			data.timestamp = 0;
	}

	/**
	 * @private
	 */
	send(frame){
		if(!this.connection.sockets.udp)
			return;
		this.step(frame);

		const data = this.connection.player.streamingData;
		var len = 28;
		var buf, random;

		audio_nonce.writeUIntBE(this.connection.authentication.ssrc, 8, 4);
		audio_nonce.writeUIntBE(data.sequence, 2, 2);
		audio_nonce.writeUIntBE(data.timestamp, 4, 4);

		audio_buffer.set(audio_nonce, 0);

		this.connection.setSpeaking(1);

		if(this.connection.authentication.mode == 'xsalsa20_poly1305_lite'){
			len = 32;

			this.nonce++;

			if(this.nonce > 4294967295)
				this.nonce = 0;
			nonce_buffer.writeUInt32BE(this.nonce, 0);

			buf = secretbox.methods.close(frame.data, nonce_buffer, this.connection.authentication.secret_key);

			audio_buffer.set(buf, 12);
			audio_buffer.set(nonce_buffer.slice(0, 4), 12 + buf.length);
		}else if(this.connection.authentication.mode == 'xsalsa20_poly1305_suffix'){
			len = 52;

			random = secretbox.methods.random(24);
			buf = secretbox.methods.close(frame.data, random, this.connection.authentication.secret_key);

			audio_buffer.set(buf, 12);
			audio_buffer.set(random, 12 + buf.length);
		}else
			audio_buffer.set(secretbox.methods.close(frame.data, audio_nonce, this.connection.authentication.secret_key), 12);
		this.connection.sockets.udp.send(
			new Uint8Array(audio_buffer.buffer, 0, frame.data.length + len)
		).catch(() => {});
	}

	/**
	 * Destroy the StreamDispatcher
	 */
	destroy(){
		this.connection.removeListener('disconnect', this.disconnect_handler);
	}
}

module.exports = StreamDispatcher;