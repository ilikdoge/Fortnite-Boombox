const messages = require('../common/messages');

module.exports = {
	execute: (bot, message, args) => {
		var playing = bot.player.getPlaying(message.guild.id);

		if(!playing){
			bot.sendMessage(message, messages.missing.playing());

			return null;
		}

		if(playing.item.message.author.id == message.author.id){
			if(playing.bitrate){
				var rate = parseInt(args[0], 10);

				if(!Number.isInteger(rate) || rate < 4000 || rate > 256000){
					bot.sendMessage(message, messages.controls.bitrate.outofrange(4000, 256000));

					return null;
				}

				playing.bitrate(Math.ceil(rate / 8));
			}else
				bot.sendMessage(message, messages.controls.bitrate.unsupported());
		}else
			bot.sendMessage(message, messages.controls.bitrate.ask());
	}, description: {
		details: ['Change the bitrate'],
		examples: ['4000', '128000'],
		syntax: ['integer']
	}, stats: {
		weight: 50
	}
};