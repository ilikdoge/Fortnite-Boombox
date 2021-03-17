const messages = require('../common/messages');

module.exports = {
	execute: (bot, message, args) => {
		var playing = bot.player.getPlaying(message.guild.id);

		if(!playing){
			bot.sendMessage(message, messages.missing.playing());

			return null;
		}

		if(playing.item.message.author.id == message.author.id){
			if(playing.speed){
				var spd = parseFloat(args[0]);

				if(Number.isNaN(spd) || spd <= 0 || spd > 4){
					bot.sendMessage(message, messages.controls.speed.outofrange(0, 4));

					return null;
				}

				playing.speed(spd);
			}else
				bot.sendMessage(message, messages.controls.speed.unsupported());
		}else
			bot.sendMessage(message, messages.controls.speed.ask());
	}, description: {
		details: ['Change the speed'],
		examples: ['2', '1', '0.5'],
		syntax: ['number']
	}, stats: {
		weight: 5
	}
};