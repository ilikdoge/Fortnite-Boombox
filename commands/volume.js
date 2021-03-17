const messages = require('../common/messages');

module.exports = {
	execute: (bot, message, args) => {
		var playing = bot.player.getPlaying(message.guild.id);

		if(!playing){
			bot.sendMessage(message, messages.missing.playing());

			return null;
		}

		if(playing.item.message.author.id == message.author.id){
			if(playing.volume){
				var vol = parseFloat(args[0]);

				if(Number.isNaN(vol) || vol < -1000 || vol > 1000){
					bot.sendMessage(message, messages.controls.volume.outofrange(-1000, 1000));

					return null;
				}

				playing.volume(vol);
			}else
				bot.sendMessage(message, messages.controls.volume.unsupported());
		}else
			bot.sendMessage(message, messages.controls.volume.ask());
	}, description: {
		details: ['Change the volume'],
		examples: ['0', '1', '0.5'],
		syntax: ['number']
	}, stats: {
		weight: 5
	}
};