const messages = require('../common/messages');
const util = require('../common/util');

module.exports = {
	execute: (bot, message, args) => {
		args = args[0];

		var playing = bot.player.getPlaying(message.guild.id);

		if(!playing){
			bot.sendMessage(message, messages.missing.playing());

			return null;
		}

		if(playing.item.message.author.id == message.author.id){
			if(playing.seek){
				if(!args){
					bot.sendMessage(message, messages.parameter.timestamp());

					return null;
				}

				var mode = 0;

				if(args[0] == '-'){
					mode = -1;
					args = args.substring(1);
				}else if(args[0] == '+'){
					mode = 1;
					args = args.substring(1);
				}

				var seconds = util.parseTimestamp(args);

				if(seconds == null){
					bot.sendMessage(message, messages.parameter.timestamp());

					return null;
				}

				if(seconds == 0 && mode != 0)
					return;
				if(mode != 0)
					seconds = mode * seconds + playing.currentTime;
				if(seconds < 0)
					seconds = 0;
				var err = playing.seek(seconds);

				if(err)
					bot.sendMessage(message, messages.controls.seek.error(err));
			}else
				bot.sendMessage(message, messages.controls.seek.unsupported());
		}else
			bot.sendMessage(message, messages.controls.seek.ask());
	}, description: {
		details: ['Seek to a timestamp or forward and rewind'],
		examples: ['13', '2:15', '+5.0', '-2.0'],
		syntax: ['hh?:mm?:ss']
	}, stats: {
		weight: 20
	}
};