module.exports = {
	execute(bot, message){
		var playing = bot.player.getPlaying(message.guild.id);

		if(playing)// && playing.item.message.member.id == message.author.id)
			playing.dispose();
	}, description: {

	}, stats: {
		weight: 10
	}
};