const messages = require('../common/messages');
const util = require('../common/util');

class Queue{
	constructor(){
		this.children = this.children();
		this.description = this.description();
		this.stats = this.stats();
	}

	description(){
		return {
			details: [
				'View, modify, attach or detach your queue',
				'View server queue'
			]
		};
	}

	stats(){
		return {
			weight: 0
		};
	}

	children(){
		return {
			detach: {
				execute: (bot, message) => {
					if(bot.player.detachQueue(message.guild.id, message.author.id))
						bot.sendMessage(message, messages.queue.detached());
					else
						bot.sendMessage(message, messages.queue.already_detached());
				}, description: {
					details: [
						'Items from your queue will no longer be played from',
						'Items will be preserved'
					]
				}, stats: {
					weight: 10
				}
			}, attach: {
				execute: (bot, message) => {
					if(!message.member.voice.channel){
						bot.sendMessage(message, messages.missing.voice_channel());

						return;
					}

					var queue = bot.player.getQueue(message.guild.id, message.author.id);
					if(queue){
						var f = function(){
							if(bot.player.attachQueue(message.guild.id, message.author.id)){
								bot.sendMessage(message, messages.queue.attached());

								//smode

								bot.player.start(message.guild.id);
							}else
								bot.sendMessage(message, messages.queue.already_attached());
						};

						if(bot.connections[message.guild.id])
							f();
						else
							bot.joinChannel(message.member.voice.channel, function(err){
								if(err)
									return bot.sendMessage(message, messages.error.connect());
								f();
							})
					}else
						bot.sendMessage(message, messages.queue.cannot_attach());
				}, description: {
					details: [
						'Items from your queue will be added to the server queue to be played'
					]
				}, stats: {
					weight: 10
				}
			}, view: {
				execute: (bot, message, args) => {
					var page = parseInt(args[0], 10) - 1;

					if(!Number.isInteger(page) || page < 0)
						page = 0;
					var queue = bot.player.getQueue(message.guild.id, message.author.id);

					if(queue){
						var mxPage = Math.ceil(queue.length / 10);

						if(page >= mxPage)
							page = mxPage - 1;
						var dt = [];
						var mn = [];
						var tdur = queue.duration;
						var durs = tdur.precision < 4 ? [util.timestamp(tdur.seconds, 2)] : [util.timestamp(tdur.seconds - tdur.precision, 2), util.timestamp(tdur.seconds + tdur.precision, 2)];

						for(var i = 0; i < 10 && i < queue.length - page * 10; i++){
							var item = queue[page * 10 + i];

							mn.push((page * 10 + i + 1) + ') ' + util.embedlink(util.shorten(item.media.title || 'Audio File', 32), item.sourceurl || item.url));
							dt.push((item.discriminator ? item.discriminator[0] + ' ' : '').toUpperCase() + (item.duration.seconds ? item.duration.timestamp : '??:??'));
						}

						bot.sendMessage(message, messages.queue.user_queue_list({name: message.member.displayName, icon: message.author.displayAvatarURL()},
							{titles: mn, details: dt}, {begin: page * 10 + 1, end: Math.min(queue.length, page * 10 + 10), length: queue.length, all: queue.length <= 10},
							{duration: durs, unknown: tdur.unknown}));
					}else
						bot.sendMessage(message, messages.queue.user_queue_empty());
				}, description: {
					details: [
						'View items in your queue'
					], examples: ['1', '2', '3'],
					syntax: ['page']
				}, stats: {
					weight: 10
				}
			}, list: {
				execute: (bot, message, args) => {
					var page = parseInt(args[0], 10) - 1;

					if(!Number.isInteger(page) || page < 0)
						page = 0;
					var order = bot.player.getOrder(message.guild.id);
					var queue = bot.player.getQueue(message.guild.id);

					if(order && order.length){
						var oc = Array.from(order);

						var tdur = {seconds: 0, precision: 0, unknown: 0};
						var titems = 0;

						var lens = [];
						var level = 0;
						var left = 0;
						var ucount = oc.length;

						for(var i = 0; i < oc.length; i++){
							var user = oc[i];
							var q = queue[user];

							tdur.seconds += q.duration.seconds;
							tdur.precision += q.duration.precision;
							tdur.unknown += q.duration.unknown;
							titems += q.length;
							lens.push(q.length);
						}

						var mxPage = Math.ceil(titems / 10);

						if(page >= mxPage)
							page = mxPage - 1;
						lens.sort((a, b) => a - b);

						for(var i = 0; i < page * 10; ){
							if(i + ucount >= page * 10){
								left = i + ucount - page * 10;

								break;
							}else{
								var inc = Math.min(lens[oc.length - ucount], level + Math.floor((page * 10 - i) / ucount));

								i += (inc - level) * ucount;
								level = inc;

								for(var j = oc.length - ucount; j < lens.length; j++)
									if(lens[j] <= level)
										ucount--;
									else
										break;
							}
						}

						var ordernew = [];
						var indexes = {};

						for(var i = 0; i < oc.length; i++)
							if(queue[oc[i]].length > level){
								ordernew.push(oc[i]);
								indexes[oc[i]] = level;
							}
						for(var i = 0; i < left; i++){
							var user = ordernew.shift();

							if(queue[user].length > level + 1){
								ordernew.push(user);
								indexes[user] = level + 1;
							}
						}

						var usr = [];
						var tl = [];
						var md = [];

						for(var i = 0; i < 10; i++){
							var user = ordernew.shift();
							var item = queue[user][indexes[user]++];

							usr.push((page * 10 + i + 1) + ') ' + item.message.member.toString());
							tl.push(util.embedlink(util.shorten(item.media.title || 'Audio File', 24), item.sourceurl || item.url));
							md.push((item.discriminator ? item.discriminator[0] + ' ' : '').toUpperCase() + (item.duration.seconds ? item.duration.timestamp : '??:??'));

							if(indexes[user] < queue[user].length)
								ordernew.push(user);
							else if(ordernew.length == 0)
								break;
						}

						var durs = tdur.precision < 4 ? [util.timestamp(tdur.seconds, 2)] : [util.timestamp(tdur.seconds - tdur.precision, 2), util.timestamp(tdur.seconds + tdur.precision, 2)];

						bot.sendMessage(message, messages.queue.list({name: message.guild.name, icon: message.guild.iconURL()}, {users: usr, titles: tl, durations: md}, {begin: page * 10 + 1, end: Math.min(titems, page * 10 + 10), all: titems <= 10, length: titems}, {duration: durs, unknown: tdur.unknown}));
					}else
						bot.sendMessage(message, messages.queue.global_queue_empty());
				}, description: {
					details: [
						'View items in server queue'
					], examples: ['1', '2', '3'],
					syntax: ['page']
				}, stats: {
					weight: 20
				}
			}, delete: {
				execute: (bot, message, args) => {
					var queue = bot.player.getQueue(message.guild.id, message.author.id);

					if(queue){
						if(!args.length){
							bot.sendMessage(message, messages.parameter.missing());

							return;
						}

						args = this.parseRange(bot, message, args[0], queue.length);

						if(!args)
							return;
						var count = args[1] - args[0] + 1;

						if(count >= queue.length)
							bot.player.emptyQueue(message.guild.id, message.author.id);
						else
							queue.splice(args[0], count);
						bot.sendMessage(message, messages.queue.deleted(count));
					}else
						bot.sendMessage(message, messages.queue.user_queue_empty());
				}, description: {
					details: [
						'Delete items from your queue'
					], examples: [
						'13-last',
						'first-21',
						'first-last'
					], syntax: ['start-end']
				}, stats: {
					weight: 30
				}
			}, remove: {
				execute: (bot, message, args) => {
					var queue = bot.player.getQueue(message.guild.id, message.author.id);

					if(queue){
						if(!args.length){
							bot.sendMessage(message, messages.parameter.missing());

							return;
						}

						args = this.parseRange(bot, message, args[0], queue.length);

						if(!args)
							return;
						var count = args[1] - args[0] + 1;

						if(count >= queue.length)
							bot.player.emptyQueue(message.guild.id, message.author.id);
						else
							queue.splice(args[0], count);
						bot.sendMessage(message, messages.queue.deleted(count));
					}else
						bot.sendMessage(message, messages.queue.user_queue_empty());
				}, description: {
					details: [
						'Delete items from your queue'
					], examples: [
						'13-last',
						'first-21',
						'first-last'
					], syntax: ['start-end']
				}, stats: {
					weight: 30
				}
			}, move: {
				execute: (bot, message, args) => {
					var queue = bot.player.getQueue(message.guild.id, message.author.id);

					if(queue){
						if(!args[0]){
							bot.sendMessage(message, messages.parameter.range());

							return;
						}

						var range = this.parseRange(bot, message, args[0], queue.length);

						if(!range)
							return;
						var count = range[1] - range[0] + 1;
						var max = queue.length - count + 1;

						if(!args[1]){
							bot.sendMessage(message, messages.queue.missing_position(max));

							return;
						}

						var pos = this.parseParam(args[1], max);

						if(pos == null){
							bot.sendMessage(message, messages.queue.missing_position(max));

							return;
						}

						queue.move(range[0], count, pos);

						bot.sendMessage(message, messages.queue.moved(count, pos + 1))
					}else
						bot.sendMessage(message, messages.queue.user_queue_empty());
				}, description: {
					details: [
						'Move items in your queue'
					], examples: [
						'13-last first',
						'first-21 last',
						'1-3 5',
						'10-11 1'
					], syntax: ['start-end', 'position']
				}, stats: {
					weight: 100
				}
			}, empty: {
				execute: (bot, message) => {
					bot.player.emptyQueue(message.guild.id, message.author.id);
					bot.sendMessage(message, messages.queue.cleared());
				}, description: {
					details: ['Empty your queue']
				}, stats: {
					weight: 10
				}
			}, shuffle: {
				execute: (bot, message, args) => {
					var queue = bot.player.getQueue(message.guild.id, message.author.id);

					if(queue){
						var start = 0;
						var end = queue.length - 1;

						if(args[0]){
							args = this.parseRange(bot, message, args[0], queue.length);

							if(!args)
								return;
							start = args[0];
							end = args[1];
						}

						var count = end - start + 1;

						if(count > 1)
							for(var i = start; i <= end; i++){
								var num = Math.floor(Math.random() * (end - i + 1) + i);
								var tmp = queue[num];

								queue[num] = queue[i];
								queue[i] = tmp;
							}
						bot.sendMessage(message, messages.queue.shuffled(count));
					}else
						bot.sendMessage(message, messages.queue.user_queue_empty());
				}, description: {
					details: ['Shuffle your queue'],
					examples: ['first-last', '3-40'],
					syntax: ['start-end']
				}, stats: {
					weight: 50
				}
			}
		};
	}

	parseParam(arg, max){
		if(arg == 'first')
			return 0;
		else if(arg == 'last')
			return max - 1;
		var n = parseInt(arg, 10) - 1;

		return Number.isInteger(n) ? (n >= 0 && n < max ? n : null) : null;
	}

	parseRange(bot, message, args, max){
		args = args.toLowerCase().split('-');

		if(args.length > 2){
			bot.sendMessage(message, messages.parameter.range());

			return null;
		}

		for(var i = 0; i < args.length; i++){
			args[i] = this.parseParam(args[i], max);

			if(args[i] == null){
				bot.sendMessage(message, messages.parameter.range_parameter(i + 1, 1, max));

				return null;
			}
		}

		if(args.length == 1)
			args.push(args[0]);
		else if(args[1] < args[0]){
			var tmp = args[1];

			args[1] = args[0];
			args[0] = tmp;
		}

		return args;
	}

	execute(){
		return this.children;
	}
};

module.exports = new Queue();