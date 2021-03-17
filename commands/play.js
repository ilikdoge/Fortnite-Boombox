'use-strict';

const request = require('request');
const m3u8 = require('m3u8-parser');
const sources = require('../source/index');
const messages = require('../common/messages');
const util = require('../common/util');

class play{
	constructor(){
		this.description = {
			details: [
				'Plays media',
				'If source not specified, an attempt will be made to determine the source'
			], syntax: ['yt|sc|ig|tw|url', 'args']
		};

		this.stats = {
			weight: 10
		};

		this.children = {
			url: {
				execute: (bot, message, args) => {
					this.url(bot, message, args);
				}, description: {
					details: [
						'Play from a url'
					], syntax: ['url']
				}, stats: {
					weight: 20
				}
			}, yt: {
				execute: (bot, message, args) => {
					this.yt(bot, message, args);
				}, description: {
					details: [
						'Play from youtube'
					], syntax: ['url|search']
				}, stats: {
					weight: 40
				}
			}, sc: {
				execute: (bot, message, args) => {
					this.sc(bot, message, args);
				}, description: {
					details: [
						'Play from soundcloud'
					], syntax: ['url|search']
				}, stats: {
					weight: 40
				}
			}, ig: {
				execute: (bot, message, args) => {
					this.ig(bot, message, args);
				}, description: {
					details: [
						'Play from instagram'
					], syntax: ['url']
				}, stats: {
					weight: 30
				}
			}, tw: {
				execute: (bot, message, args) => {
					this.tw(bot, message, args);
				}, description: {
					details: [
						'Play from twitter'
					], syntax: ['url']
				}, stats: {
					weight: 60
				}
			}
		};
	}

	execute(bot, message, args){
		var chld = this.children;
		var match = args.join(' ');

		if(sources.yt.matches(match))
			return chld.yt;
		if(sources.sc.matches(match))
			return chld.sc;
		if(sources.ig.matches(match))
			return chld.ig;
		if(sources.url.matches(match))
			return chld.url;
		return chld;
	}

	defaultHandle(bot, message, source, query, process){
		var handler = null;

		return {
			configure: (type) => {
				if(type == 'search'){
					message.react('🔎').then(function(){}).catch(function(){});
					handler = this.handleSearch(bot, message, source, query, (result) => {
						if(process.search)
							process.search(result, (err) => {
								if(err)
									bot.sendMessage(message, messages.error.module(source, err.message));
								else
									this.queueItem(bot, message, result);
							});
						else
							this.queueItem(bot, message, result);
					});
				}else if(type == 'playlist')
					handler = this.handlePlaylist(bot, message, (list) => {
						if(process.playlist)
							process.playlist(list, (err) => {
								if(err)
									bot.sendMessage(message, messages.error.module(source, err.message));
								else
									this.queueItems(bot, message, list);
							});
						else
							this.queueItems(bot, message, list);
					});
			}, error: (err) => {
				if(handler)
					handler(null);
				else
					bot.sendMessage(message, messages.error.module(source, err.message));
			}, media: (result) => {
				if(process.media)
					process.media(result, (err) => {
						if(err)
							bot.sendMessage(message, messages.error.module(source, err.message));
						else
							this.queueItem(bot, message, result);
					});
				else
					this.queueItem(bot, message, result);
			}, playlist: (list) => {
				handler(list);
			}, search: (results) => {
				handler(results.slice(0, 4));
			}
		};
	}

	url(bot, message, args){
		if(!args.length){
			bot.sendMessage(message, messages.parameter.missing());

			return;
		}

		args = args.join(' ');
		sources.url.get(args, this.defaultHandle(bot, message, 'URL', args, {}));
	}

	yt(bot, message, args){
		if(!args.length){
			bot.sendMessage(message, messages.parameter.missing());

			return;
		}

		args = args.join(' ');
		sources.yt.get(args, this.defaultHandle(bot, message, 'Youtube', args, {
			search(result, cb){
				result._getUrlStream(cb);
			}
		}));
	}

	sc(bot, message, args){
		if(!args.length){
			bot.sendMessage(message, messages.parameter.missing());

			return;
		}

		args = args.join(' ');
		sources.sc.get(args, this.defaultHandle(bot, message, 'Soundcloud', args, {}));
	}

	ig(bot, message, args){
		if(!args.length){//playlist gen durs
			bot.sendMessage(message, messages.parameter.missing());

			return;
		}

		args = args.join(' ');
		sources.ig.get(args, this.defaultHandle(bot, message, 'Instagram', args, {}));
	}

	tw(bot, message, args){
		if(!args.length){
			bot.sendMessage(message, messages.parameter.missing());

			return;
		}
	}

	load_first_search(bot, message, source, query){
		if(!query){
			bot.sendMessage(message, messages.parameter.missing());

			return;
		}

		var sourceName = null;

		if(source == 'yt')
			sourceName = 'Youtube';
		else if(source == 'sc')
			sourceName = 'Soundcloud';
		/* else if(source == 'ig')
			sourceName = 'Instagram';
		else if(source == 'tw')
			sourceName = 'Twitter'; */
		sources[source].search(query, (err, data) => {
			if(err)
				return bot.sendMessage(message, messages.error.module(sourceName, err.message));
			if(data.length){
				var result = data[0];

				result._getUrlStream((err) => {
					if(err)
						return bot.sendMessage(message, messages.error.module(sourceName, err.message));
					this.queueItem(bot, message, result);
				});
			}else
				bot.sendMessage(message, {embed: messages.search.finished(message, sourceName, query, 0), timeout: 8000});
		});
	}

	_itemDurOverride(seconds, precision){
		this.duration = {seconds, precision, timestamp: util.timestamp(seconds, 2)};
	}

	queueItems(bot, message, items){
		for(var i = 0; i < items.length; i++){
			var item = items[i];

			item.setDuration = this._itemDurOverride;
			item.setDuration(item.duration.seconds, item.duration.precision);
			item.message = message;
		}

		var f = () => {
			if(bot.player.attachQueue(message.guild.id, message.author.id))
				bot.player.start(message.guild.id);
		};

		if(bot.player.addItems(message.guild.id, message.author.id, items) && message.member.voice.channel){
			var queue = bot.player.getQueue(message.guild.id, message.author.id);

			queue.attached = true;

			if(bot.connections[message.guild.id]){
				var order = bot.player.getOrder(message.guild.id);
				var playing = bot.player._data[message.guild.id] && bot.player._data[message.guild.id].playing;

				f();

				return (!order || !order.length) && !playing ? 2 : 1;
			}

			bot.joinChannel(message.member.voice.channel, function(err){
				if(!err)
					f();
				else
					queue.attached = false;
			});

			return 1;
		}

		return 0;
	}

	processItem(item){
		if(item.url && !item.duration.seconds)
			;//
	}

	queueItem(bot, message, item){
		this.processItem(item);

		var att = this.queueItems(bot, message, [item]);
		var noattach = att == 0 && !bot.player.getQueue(message.guild.id, message.author.id).attached;

		if(att < 2)
			bot.sendMessage(message, messages.media.added(item, noattach)).then(function(msg){
				item.queue_message = msg;

				setTimeout(function(){
					item.queue_message = null;
				}, messages.SHORT_TIMEOUT);
			});
	}

	handleSearch(bot, message, source, query, callback){
		var msg = null;
		var results = null;
		var got = false;

		var list = () => {
			this.listResults(bot, message, source, query, msg, results, function(result){
				callback(result);
			});
		};

		bot.sendMessage(message, {embed: messages.search.fetching(message, source, query), timeout: 0}).then((m) => {
			msg = m;

			if(got)
				list();
		});

		return (r) => {
			results = r;
			got = true;

			if(msg)
				list();
		};
	}

	listResults(bot, message, source, query, pre, results, callback){
		var finish = {embed: bot.generateMessage(message, {embed: messages.search.finished(message, source, query, results.length)})};

		if(results && results.length){
			var msgs = [pre];
			var chosen = false;
			var index = 0;

			pre.edit(finish);

			var send = function(){
				bot.sendMessage(message, {embed: messages.search.result(results[index++], index)}).then(function(msg){
					if(chosen)
						msg.delete();
					else{
						msgs.push(msg);

						if(index < results.length)
							send();
					}
				});
			};

			send();

			var del = function(){
				while(msgs.length)
					msgs.shift().delete();
			};

			var expire = 32000;
			var timeout = setTimeout(del, expire);

			var response = function(bot, message, contents){
				clearTimeout(timeout);

				if(!message || contents.toLowerCase() == 'cancel'){
					chosen = true;

					return del();
				}

				var num = parseInt(contents);

				if(Number.isInteger(num) && num > 0 && num <= results.length){
					callback(results[num - 1]);

					chosen = true;

					del();
				}else{
					bot.sendMessage(message, messages.parameter.number(1, results.length));
					bot.awaitUser(message, response, expire);

					timeout = setTimeout(del, expire);
				}
			};

			bot.awaitUser(message, response, expire);
		}else
			pre.edit(finish).then(function(){
				setTimeout(function(){
					pre.delete();
				}, 8000);
			});
	}

	handlePlaylist(bot, message, callback){
		var msg = null;
		var results = null;
		var got = false;

		var prompt = function(){
			var embed = messages.playlist.finished(message, results && results.length);

			if(results && results.length){
				embed.description += '\n' + messages.playlist.shuffle_prompt();

				msg.edit({embed: bot.generateMessage(message, {embed: embed})}).then(function(){
					var timeout = setTimeout(function(){
						msg.delete();

						callback(results);
					}, 8000);

					bot.awaitUser(message, (bot, m, content) => {
						clearTimeout(timeout);

						msg.delete();

						if(!bot || (content = content.toLowerCase()) == 'cancel'){
							if(bot)
								bot.sendMessage(message, messages.playlist.removed());

							return;
						}

						if(content == 'yes')
							for(var i = 0; i < results.length; i++){
								var num = Math.floor(Math.random() * (results.length - i) + i);
								var tmp = results[num];

								results[num] = results[i];
								results[i] = tmp;
							}
						callback(results);
					}, 8000);
				}).catch(function(){
					callback(results);
				});
			}else
				msg.edit({embed: bot.generateMessage(message, {embed: embed})}).then(function(){
					setTimeout(function(){
						msg.delete();
					}, 8000);
				});
		};

		bot.sendMessage(message, {embed: messages.playlist.fetching(message), timeout: 0}).then(function(m){
			msg = m;

			if(got)
				prompt();
		});

		return (r) => {
			results = r;
			got = true;

			if(msg)
				prompt();
		};
	}

	m3u8playlist(uri, cb){
		request({method: 'GET', url: uri}, (error, response, body) => {
			if(error)
				return cb(error.message, null);
			if(response.statusCode < 200 || response.statusCode >= 400)
				return cb(response.statusCode, null);
			var parser = new m3u8.Parser();

			parser.push(body);
			parser.end();

			var manifest = parser.manifest;

			if(manifest.segments.length == 0 && !manifest.playlists)
				return cb(new Error('No sources'), null);
			if(manifest.segments.length)
				return cb(null, [uri]);
			manifest.playlists.sort(function(a, b){
				var aa = a.attributes;
				var ba = b.attributes;
				if(aa.BANDWIDTH && ba.BANDWIDTH)
					return aa.BANDWIDTH - ba.BANDWIDTH;
				if(aa.RESOLUTION && ba.RESOLUTION){
					var ares = aa.RESOLUTION;
					var bres = ba.RESOLUTION;
					var af = aa['FRAME-RATE'] ? parseInt(aa['FRAME-RATE']) : 1;
					var bf = ba['FRAME-RATE'] ? parseInt(ba['FRAME-RATE']) : 1;

					if(!Number.isInteger(af))
						af = 1;
					if(!Number.isInteger(bf))
						bf = 1;
					return ares.width * ares.height * af - bres.width * bres.height * bf;
				}

				return 0;
			});

			cb(null, manifest.playlists.map(function(a){
				return url.resolve(uri, a.uri);
			}));
		});
	}
}

module.exports = new play();