"use-strict";

const EventEmitter = require('events');
const similarity = require('string-similarity');

(function(){
	require('prism-media');

	require.cache[require.resolve('prism-media')].exports = function(){};
})();

const Discord = require('discord.js');
const secretbox = {};

(async () => {
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

		if(lib.ready)
			await lib.ready;
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
})();

const Map = require('./common/map');
const commands = require('./commands/index');
const messages = require('./common/messages');

const AudioPlayer = require('./audio/player');
const HttpFileProvider = require('./audio/util/HttpFileProvider');

class WaitManager{
	constructor(){
		this.callback = null;
		this.expire = null;
	}

	set(callback, timeout){
		this.reject();
		this.callback = callback;
		this.expire = Date.now() + timeout;
	}

	reject(){
		if(this.callback){
			if(this.expire >= Date.now())
				this.callback.apply(null, null);
			this.callback = null;
			this.expire = null;
		}
	}

	fullfill(){
		if(this.callback){
			var cb = this.callback;
			var xp = this.expire;

			this.callback = null;
			this.expire = null;

			if(xp >= Date.now())
				cb.apply(null, arguments);
		}
	}
}

class RateLimit{
	constructor(){
		this.value = 0;
		this.max = 200;
		this.stack = [];
	}

	push(f){
		this.stack.push(f);

		if(this.value < this.max)
			this.execute();
	}

	execute(){
		if(this.stack.length)
			this.update(this.stack.shift()());
	}

	update(value){
		this.value += value;

		if(value > 0)
			setTimeout(() => {
				this.update(-value);
			}, 8000);
		else if(this.value < this.max)
			this.execute();
	}
}

class Player{
	constructor(){
		this.userQueue = class extends Array{
			constructor(){
				super();

				this.duration = {seconds: 0, precision: 0, unknown: 0};
				this.attached = false;
			}

			push(item){
				super.push(item);

				if(item.duration.seconds){
					this.duration.seconds += item.duration.seconds;
					this.duration.precision += item.duration.precision;
				}else
					this.duration.unknown++;
				return item;
			}

			shift(){
				var item = super.shift();

				if(item.duration.seconds){
					this.duration.seconds -= item.duration.seconds;
					this.duration.precision -= item.duration.precision;
				}else
					this.duration.unknown--;

				return item;
			}

			splice(){
				var items = super.splice.apply(this, arguments);
				var durs = 0, dures = 0, duru = 0;

				for(var i = 0; i < items.length; i++){
					var dur = items[i].duration;

					if(dur){
						durs += dur.seconds;
						dures += dur.precision;
					}else
						duru++;
				}

				this.duration.precision -= dures;
				this.duration.seconds -= durs;
				this.duration.unknown -= duru;

				items.duration = {durs, dures, duru};

				return items;
			}

			move(si, count, ei){
				super.splice.apply(this, [ei, 0].concat(super.splice(si, count)));
			}
		};

		this._data = {};
		this._events = {};
	}

	_initialize(guild){
		if(this._data[guild])
			return;
		this._data[guild] = {queue: {}, order: [], playing: null};
	}

	_play(item, data, done, error){
		var output = {
			codec: 'opus',
			sample_rate: audio_frequency,
			channel_count: audio_channels,
			frame_size: audio_framesize,
			bitrate: 32000,
			resample_quality: 1//medium sinc
		};

		var player = null;

		if(item.custom_player){
			player = item.custom_player;
			player.start(output);

			player.on('ready', () => {
				player.player.use_passthrough = true;
			});
		}else{
			player = new AudioPlayer(item.getFile(), output);
			player.on('ready', () => {
				player.start();
				player.player.use_passthrough = true;
			});

			player.probe();
		}

		player.on('data', (packet) => {
			data.apply(null, [packet]);
		});

		player.on('debug', (...args) => {
			debug.apply(null, args);
		});

		player.on('error', (err) => {
			player.destroy();
			error.apply(null, [err]);
			done.apply(null);
		});

		player.on('finish', () => {
			player.destroy();
			done.apply(null);
		});

		return {item, get currentTime(){
			return player.currentTime;
		}, get duration(){
			return player.duration;
		}, get frames_dropped(){
			return player.frames_dropped;
		}, get frames_delivered(){
			return player.frames_delivered;
		}, setPaused(p){
			player.setPaused(p);
		}, seek(t){
			return player.seek(t);
		}, volume(v){
			player.setVolume(v);
		}, bitrate(b){
			player.setBitrate(b);
		}, speed(s){
			player.setSpeed(s);
		}, dispose(){
			player.destroy();
			done.apply(null);
		}, player};
	}

	_end(guild){
		this.emit('end', guild);

		if(this._data[guild])
			this._data[guild].playing = null;
	}

	_next(guild){
		var data = this._data[guild];

		if(!data)
			return this._end(guild);
		if(!data.order.length)
			return this._end(guild);
		var user = data.order.shift();
		var item = data.queue[user].shift();

		if(data.queue[user].length)
			data.order.push(user);
		else
			delete data.queue[user];

		data.playing = this._play(item, (packet, sequence, timestamp) => {
			this.emit('data', guild, packet, sequence, timestamp);
		}, () => {
			this.emit('finish', guild);
			this._next(guild);
		}, (error) => {
			this.emit('error', item, error);
		});

		this.emit('playing', data.playing);
	}

	addItems(guild, user, items){
		this._initialize(guild);

		var data = this._data[guild];
		var queue = data.queue[user];

		if(!queue)
			data.queue[user] = queue = new (this.userQueue)();
		var ret = queue.length == 0;

		for(var i = 0; i < items.length; i++)
			queue.push(items[i]);
		return ret;
	}

	skip(guild){
		var playing = this.getPlaying(guild);

		if(playing)
			playing.dispose();
	}

	emptyQueue(guild, user){
		var data = this._data[guild];

		if(data){
			delete data.queue[user];

			var index = data.order.indexOf(user);

			if(index < 0)
				return false;
			data.order.splice(index, 1);

			return true;
		}

		return false;
	}

	attachQueue(guild, user){
		var data = this._data[guild];

		if(data && data.order.indexOf(user) == -1){
			data.order.push(user);
			data.queue[user].attached = true;

			return true;
		}

		return false;
	}

	detachQueue(guild, user){
		var data = this._data[guild];

		if(data){
			var index = data.order.indexOf(user);

			if(index >= 0){
				data.order.splice(index, 1);
				data.queue[user].attached = false;

				return true;
			}
		}

		return false;
	}

	getOrder(guild){
		return this._data[guild] && this._data[guild].order;
	}

	getQueue(guild, user){
		var data = this._data[guild];

		if(data){
			if(user)
				return data.queue[user];
			return data.queue;
		}

		return null;
	}

	getPlaying(guild){
		var playing = this._data[guild] && this._data[guild].playing;

		if(playing)
			return playing;
		return null;
	}

	start(guild){
		if(this._data[guild] && !this._data[guild].playing){
			this.emit('start');
			this._next(guild);
		}
	}

	reset(guild){
		var data = this._data[guild];

		if(data){
			data.order = [];
			data.queue = {};

			if(data.playing){
				data.playing.dispose();
				data.playing = null;
			}
		}
	}

	clear(guild){
		var data = this._data[guild];

		if(data){
			data.order = [];

			if(data.playing){
				data.playing.dispose();
				data.playing = null;
			}

			for(var i in data.queue)
				data.queue[i].attached = false;
		}
	}

	on(name, cb){
		if(this._events[name])
			this._events[name].push(cb);
		else
			this._events[name] = [cb];
	}

	emit(name, ...args){
		var evt = this._events[name];

		if(evt)
			for(var i = 0; i < evt.length; i++)
				evt[i].apply(this, args);
	}
}

class Trigger{
	constructor(){
		this.play = this.play();
		this.primary = this.primary();
		this.secondary = this.secondary();
	}

	play(){
		return {
			execute: (bot, message, args) => {
				var base = bot.commands.play;
				var ret = base.execute(bot, message, args);

				if(ret.execute)
					return ret;
				return {
					execute: (bot, message, args) => {
						message.react('🔎').then(function(){}).catch(function(){});
						bot.commands.play.load_first_search(bot, message, 'yt', args.join(' '));
					}, stats: {
						weight: 40
					}
				};
			}, stats: {
				weight: 10
			}
		};
	}

	primary(){
		return {
			default: (bot, message, args) => {
				bot.addCommand(message, args);
			}, alexa: (bot, message, args) => {
				// if(!bot.options.alexa)
					return;
				if(!bot.settings.get(message.guild.id, false).get('al'))
					return;
				var cmds = {};

				for(var i in bot.commands)
					cmds[i] = bot.commands[i];
				cmds.play = this.play;
				bot.addCommand(message, args, 'alexa', cmds);
			}
		}
	}

	secondary(){
		return {
			play: {args: [], function: this.play},
			pyt: {args: ['play', 'yt']},
			psc: {args: ['play', 'sc']},
			pig: {args: ['play', 'ig']},
			skip: {args: ['skip']},
			stop: {args: ['stop']},
			seek: {args: ['seek']},
			ply: {args: ['playing']},
			np: {args: ['playing']},
			playing: {args: ['playing']},
			np: {args: ['playing']},
			queue: {args: ['queue']},
			eval: {args: ['dev', 'eval']},
			dev: {args: ['dev']},
			performance: {args: ['performance']},
			volume: {args: ['volume']},
			bitrate: {args: ['bitrate']},
			help: {args: ['help']},
			speed: {args: ['speed']},
			nightcore: {args: ['speed', '1.2']},
			undo: {args: ['queue', 'delete', 'last']}
		};
	}

	getPrimary(prefix){
		var primary = {};

		primary[prefix] = this.primary.default;
		primary.alexa = this.primary.alexa;

		return primary;
	}

	getSecondary(prefix, trigger){
		if(trigger.startsWith(prefix)){
			var secondary = this.secondary[trigger.substring(prefix.length)];

			if(!secondary)
				return null;
			return function(bot, message, args){
				bot.addCommand(message, secondary.args.concat(args), trigger, secondary.function, secondary.args.length);
			};
		}

		var secondary = this.secondary[trigger];

		if(!secondary)
			return null;
		return function(bot, message, args){
			bot.addCommand(message, secondary.args.concat(args), trigger, secondary.function, secondary.args.length);
		};
	}

	get(trigger, prefixes){
		var primary = this.getPrimary(prefixes[0]);

		return primary[trigger] || this.getSecondary(prefixes[1], trigger);
	}
}

const audio_nonce = Buffer.alloc(24);

audio_nonce[0] = 0x80;
audio_nonce[1] = 0x78;

const audio_buffer = new Uint8Array(7678);

const audio_framesize = 2880;
const audio_frequency = 48000;
const audio_channels = 2;

const nonce_buffer = Buffer.alloc(24);

const empty_buffer = (function(){
	const opus = require('./audio/codec/opus');

	var encoder = new opus.Encoder(opus.Encoder.OPUS_AUDIO, audio_frequency, audio_channels, 10);

	var output = encoder.encode(new Uint8Array(audio_framesize * audio_channels), audio_framesize, 1000);

	encoder.destroy();

	if(output.error)
		throw new Error(output.error);
	return output.data;
})();

const passes = 1;

function step_connection(connection){
	if(!connection.sequence)
		connection.sequence = 0;
	if(!connection.timestamp)
		connection.timestamp = 0;
	connection.sequence++;

	if(connection.sequence > 65535)
		connection.sequence = 0;
	connection.timestamp += audio_framesize;

	if(connection.timestamp > 4294967295)
		connection.timestamp = 0;
	audio_nonce.writeUIntBE(connection.authentication.ssrc, 8, 4);
	audio_nonce.writeUIntBE(connection.sequence, 2, 2);
	audio_nonce.writeUIntBE(connection.timestamp, 4, 4);
}

function send_packet(connection, buffer, cb){
	step_connection(connection);

	audio_buffer.set(audio_nonce, 0);

	connection.setSpeaking(1);

	var len = 28;

	if(connection.authentication.mode == 'xsalsa20_poly1305_lite'){
		len = 32;

		if(!connection.nonce)
			connection.nonce = 0;
		connection.nonce++;

		if(connection.nonce > Number.MAX_SAFE_INTEGER)
			connection.nonce = 0;
		nonce_buffer.writeUInt32BE(connection.nonce, 0);

		const buf = secretbox.methods.close(buffer, nonce_buffer, connection.authentication.secret_key);

		audio_buffer.set(buf, 12);
		audio_buffer.set(nonce_buffer.slice(0, 4), 12 + buf.length);
	}else if(connection.authentication.mode == 'xsalsa20_poly1305_suffix'){
		len = 52;

		const random = secretbox.methods.random(24);
		const buf = secretbox.methods.close(buffer, random, connection.authentication.secret_key);

		audio_buffer.set(buf, 12);
		audio_buffer.set(random, 12 + buf.length);
	}else
		audio_buffer.set(secretbox.methods.close(buffer, audio_nonce, connection.authentication.secret_key), 12);
	var data = new Uint8Array(audio_buffer.buffer, 0, buffer.length + len);

	for(var i = 0; i < passes && connection.sockets.udp; i++)
		connection.sockets.udp.send(data).catch(cb);
}

class Bot extends EventEmitter{
	constructor(token, options){
		super();

		this.client = new Discord.Client();
		this.commands = commands;
		this.prefix = options.prefix;
		// this.settings = options.settings;
		// this.binds = options.binds;
		this.options = options;

		this.waiting = new Map(function(){
			return new Map(function(){
				return new WaitManager();
			});
		});

		this.ratelimit = new Map(function(){
			return new RateLimit();
		});

		this.triggers = new Trigger();

		this.sentMessages = {};
		this.connections = {};

		this.connected = 0;
		this.streaming = 0;
		this.player = new Player();

		this.player.on('playing', (item) => {
			item = item.item;

			var member = item.message.member;

			if(member.voice.channel)
				this.joinChannel(member.voice.channel);
			var msg = messages.media.playing(item, {name: this.client.user.username, icon: this.client.user.displayAvatarURL()});

			item.message.react('▶').then(function(){}).catch(function(){});

			if(item.queue_message)
				item.queue_message.edit({embed: this.generateMessage(item.message, msg)});
			else
				this.sendMessage(item.message, msg);
		});

		this.player.on('data', (guild, buffer) => {
			var connection = this.connections[guild];

			if(!connection)
				return this.player.clear(guild);
			send_packet(connection, buffer, () => {
				this.player.clear(guild);
			});
		});

		this.player.on('finish', (guild) => {
			var connection = this.connections[guild];

			if(!connection)
				return;
			for(var i = 0; i < 5; i++)
				send_packet(connection, empty_buffer, () => {
					this.player.clear(guild);
				});
		});

		this.player.on('start', () => {
			this.streaming++;
			this.updateStatus();
		});

		this.player.on('end', (guild) => {
			this.streaming--;
			this.updateStatus();

			var connection = this.connections[guild];

			if(connection){
				// connection.setSpeaking(false);

				if(connection.no_audio_timeout)
					clearTimeout(connection.no_audio_timeout);
				connection.no_audio_timeout = setTimeout(() => {
					if(connection)
						connection.disconnect();
				}, 600000);
			}
		});

		this.player.on('error', (item, error) => {
			this.sendMessage(item.message, messages.media.error(item, error, {name: this.client.user.username, icon: this.client.user.displayAvatarURL()}));

			debug('BOT', 'ERROR', error);
		});

		this.client.on('message', (message) => {
			this.processMessage(message);
		});

		this.client.on('ready', () => {
			this.updateStatus();
		});

		this.client.on('error', () => {
			this.destroy();
		});

		this.client.on('voiceStateUpdate', (old, cur) => {
			var connection = this.connections[cur.guild.id];

			if(cur.id == this.client.user.id && !cur.channelId && connection)
				connection.disconnect();
			if(connection)
				if(connection.channel.members.size == 1){
					if(!connection.no_listener_timeout)
						connection.no_listener_timeout = setTimeout(() => {
							if(this.connections[cur.guild.id])
								this.connections[cur.guild.id].disconnect();
						}, 120000);
				}else if(connection.no_listener_timeout){
					clearTimeout(connection.no_listener_timeout);

					connection.no_listener_timeout = null;
				}
		});

		this.client.on('raw', (pkt) => {
			debug('DISCORD', 'PACKET', pkt);
		});

		this.client.login(token);
	}

	processMessage(message){
		if(!message.guild)
			return;
		if(message.author.bot)
			return;
		var lines = message.content.split('\n');

		for(var i = 0; i < lines.length; i++){
			var line = lines[i].trim().split(/[ ]+/g);
			var waiting = this.waiting.get(message.guild.id).get(message.author.id);
			var func = this.triggers.get(line[0].toLowerCase(), [this.prefix.default, this.prefix.short]);

			if(func){
				waiting.reject();

				func(this, message, line.splice(1));
			}

			waiting.fullfill(this, message, line.join(' '));
		}
	}

	generateMessage(message, opts){
		var color = this.options.color;

		var member = message.guild.members.resolve(this.client.user.id);

		if(member){
			var roles = Array.from(member.roles.cache.values()).sort((a, b) => b.calculatedPosition - a.calculatedPosition);

			for(var i = 0; i < roles.length; i++)
				if(roles[i].color){
					color = roles[i].color;

					break;
				}
		}

		if(opts.content){
			var index = 0;
			var fields = [];

			while(index < opts.content.length){
				fields.push({name: opts.content.substring(index, index + 255), value: '_ _'});
				index += 255;
			}

			return {
				color: color,
				fields: fields
			};
		}else{
			var embed = opts.embed;

			if(embed.author){
				if(!embed.author.name)
					embed.author.name = this.client.user.username;
				if(!embed.author.icon_url)
					embed.author.icon_url = this.client.user.displayAvatarURL();
			}

			if(opts.add_footer && !embed.footer)
				embed.footer = {text: message.author.username, icon_url: message.author.displayAvatarURL()};
			embed.color = color;

			return embed;
		}
	}

	sendMessage(message, opts){
		if(this.destroyed)
			return new Promise((resolve, reject) => {reject(new Error('Bot destroyed'))});
		var prom = message.channel.send({embed: this.generateMessage(message, opts)});

		if(opts.cleanup)// || this.settings.get(message.guild.id, false).get('cl', false))
			prom.then((msg) => {
				this.sentMessages[msg.id] = msg;

				setTimeout(() => {
					msg.delete().then(() => {
						delete this.sentMessages[msg.id];
					}).catch(() => {
						delete this.sentMessages[msg.id];
					});
				}, opts.timeout || 600000);
			});
		prom.catch(function(err){
			debug('DISCORD', 'MESSAGE ERROR', opts, err);
		});

		return prom;
	}

	awaitUser(message, callback, timeout){
		this.waiting.get(message.guild.id).get(message.author.id).set(callback, timeout);
	}

	joinChannel(channel, callback){
		var perms = channel.permissionsFor(this.client.user);

		if(!perms.has('CONNECT', true) || !perms.has('SPEAK', true) || !perms.has('VIEW_CHANNEL', true)){
			if(callback)
				callback(new Error('No permissions to connect'), null);
			return;
		}

		if(this.connections[channel.guild.id]){
			var connection = this.connections[channel.guild.id];

			if(connection.status > 0){
				if(callback){
					connection.once('ready', function(){
						callback(null, connection);
					});

					connection.once('failed', function(err){
						callback(err, null);
					});

					connection.once('error', function(err){
						callback(err, null);
					});
				}
			}else if(callback)
				callback(null, connection);
			if(connection.no_audio_timeout)
				clearTimeout(connection.no_audio_timeout);
			channel.join();
		}else
			channel.join().then((connection) => {
				this.connected++;
				this.connections[channel.guild.id] = connection;

				connection.once('disconnect', () => {
					clearTimeout(connection.no_audio_timeout);
					clearTimeout(connection.no_listener_timeout);

					delete this.connections[channel.guild.id];

					this.player.clear(channel.guild.id);
					this.connected--;
				});

				if(callback)
					callback(null, connection);
			}).catch(function(err){
				if(callback)
					callback(err, null);
			});
	}

	addCommand(message){
		this.ratelimit.get(message.author.id).push(() => {
			return this.runCommand.apply(this, arguments);
		});
	}

	runCommand(message, args, pref = this.prefix.default, node = this.commands, ps = 0){
		if(this.destroyed)
			return;
		var past = [];
		var weightAdded = 0;

		while(node){
			if(node.execute){
				weightAdded += node.stats.weight || 0;
				node = node.execute(this, message, Array.from(args));
			}else if(args[0]){
				var val = args[0].toLowerCase();

				if(node[val]){
					node = node[val];
					past.push(val);
					args.shift();
				}else
					break;
			}else
				break;
		}

		if(!node)
			return weightAdded;
		var cmd = [pref].concat(past.slice(ps));

		if(args[0]){
			var arr = [];

			if(args[0].length <= 30)
				for(var param in node)
					arr.push(param);
			if(arr.length)
				this.sendMessage(message, messages.command.invalid(cmd.concat([similarity.findBestMatch(args[0], arr).bestMatch.target]).join(' ')));
			else
				this.sendMessage(message, messages.command.undefined());
		}else{
			var available = [];

			for(var i in node)
				available.push(i);
			this.sendMessage(message, messages.command.available(cmd.join(' '), available));
		}

		return weightAdded;
	}

	updateStatus(){
		if(this.streaming == 0)
			this.client.user.setActivity(this.prefix.default + ' help', {type: 'LISTENING'});
		else
			this.client.user.setActivity('audio to ' + this.streaming + (this.streaming > 1 ? ' servers' : ' server'), {type: 'STREAMING', url: 'https://twitch.tv/musicbox'});
	}

	destroy(){
		if(this.destroyed)
			return;
		this.destroyed = true;

		var tdel = 1;

		var del = () => {
			tdel--;

			if(tdel == 0){
				for(var i in this.connections)
					this.connections[i].disconnect();
				this.client.destroy();

				this.emit('destroyed');
			}
		};

		for(var i in this.sentMessages){
			tdel++;

			this.sentMessages[i].delete().then(del).catch(del);
		}

		del();
	}
}

module.exports = Bot;
