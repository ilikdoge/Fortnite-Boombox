/* Finds a library to encrypt audio packets */
const secretbox = {};

async function load(){
	var lib = null;

	try{
		lib = require('sodium');
		secretbox.methods = {
			close: lib.api.crypto_secretbox_easy,
			random: n => sodium.randombytes_buf(n)
		};

		return;
	}catch(e){}

	try{
		lib = require('libsodium-wrappers');

		if(lib.ready){
			secretbox.methods = {
				close: () => {return Buffer.alloc(0)},
				random: (n) => {return Buffer.alloc(n)}
			};

			await lib.ready;
		}

		secretbox.methods = {
			close: lib.api.crypto_secretbox_easy,
			random: n => sodium.randombytes_buf(n)
		};

		return;
	}catch(e){}

	try{
		lib = require('tweetnacl');
		secretbox.methods = {
			close: lib.secretbox,
			random: n => tweetnacl.randomBytes(n)
		};

		return;
	}catch(e){}
}

load();

module.exports = secretbox;