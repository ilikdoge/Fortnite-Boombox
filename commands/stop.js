module.exports = {
	execute: (bot, message) => {
		bot.player.emptyQueue(message.guild.id, message.author.id);

		var playing = bot.player.getPlaying(message.guild.id);

		if(playing && playing.item.message.member.id == message.author.id)
			playing.dispose();
	}, description: {
		details: [
			'Empty your queue',
			'If playing is queued by you, skip'
		]
	}, stats: {
		weight: 5
	}
};