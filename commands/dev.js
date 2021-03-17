const messages = require('../common/messages');

class Dev{
	constructor(){
		this.description = this.description();
		this.stats = this.stats();
		this.children = this.children();
	}

	description(){
		return {
			details: [
				'Dev command branch'
			]
		};
	}

	stats(){
		return {
			weight: 0
		}
	}

	children(){
		return {
			restart: {
				execute: (bot) => {
					bot.destroy();
				}, description: {
					details: [
						'Kill bot, reload all files, and restart',
						'May leave other bots outdated'
					]
				}, stats: {
					weight: 0
				}
			}, eval: new (class{
				constructor(){
					this.description = this.description();
					this.stats = this.stats();
					this.util = require('util');
				}

				description(){
					return {
						details: [
							'Run code'
						]
					};
				}

				stats(){
					return {
						weight: 0
					}
				}

				execute(bot, message, args){
					try{
						args = eval(args.join(' '));
					}catch(e){
						this.send(bot, message, 'Error', e);

						return;
					}

					if(args instanceof Promise)
						args.then((v) => {
							this.send(bot, message, 'Output', v);
						}).catch((v) => {
							this.send(bot, message, 'Promise Exception', v);
						});
					this.send(bot, message, 'Output', args);
				}

				send(bot, message, title, data){
					data = this.util.inspect(data);

					var i = 0;

					while(i < data.length && i < 8000){
						bot.sendMessage(message, {embed: {
							title: title,
							description: '```js\n' + data.substring(i, i + 2000) + '```'
						}, timeout: 32000});

						i += 2000;
					}
				}
			}), reboot: {
				execute: (bot, message) => {
					var f = () => {
						bot.on('destroyed', () => {
							process.exit(0);
						});

						bot.destroy();
					};

					message.react('✅').then(f).catch(f);
				}, description: {
					details: [
						'Reboot process'
					]
				}, stats: {
					weight: 0
				}
			}
		};
	}

	execute(bot, message){
		if(bot.options.dev[message.author.id])
			return this.children;
		else
			bot.sendMessage(message, messages.command.dev());
	}
};

module.exports = new Dev();