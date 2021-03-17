const messages = require('../common/messages');
const util = require('../common/util');

function execute_internal(bot, message, display_stats){
	var playing = bot.player.getPlaying(message.guild.id);

	if(!playing){
		bot.sendMessage(message, messages.missing.playing());

		return null;
	}

	var item = playing.item;
	var msg = messages.media.preview(item, {name: bot.client.user.username, icon: bot.client.user.displayAvatarURL()});
	var fields = [/*{
		name: 'Elapsed',
		value: timestamp(elapsed, 2)
	}, {
		name: 'Current Time',
		value: util.timestamp(playing.currentTime, 2) + ' / ' + util.timestamp(playing.duration, 2),
		inline: true
	}*/];

	msg.embed.title += ' [' + util.timestamp(playing.currentTime, 2) + ' / ' + util.timestamp(playing.duration, 2) + ']';
	msg.embed.footer = {text: item.message.member.displayName, icon_url: item.message.member.user.displayAvatarURL()};

	if(playing.duration)
		msg.embed.image = {url: 'https://playbar.ilikdoge.com/playbar2_percent_' + Math.round(playing.currentTime * 100 / playing.duration) + '.png'};

	if(display_stats){
		var dropped = playing.frames_dropped;
		var delivered = playing.frames_delivered;

		fields.push({
			name: 'Frames dropped/delivered', value:
			dropped + ' / ' + delivered + ' (' + (Math.round(delivered * 10000 / (delivered + dropped)) / 100) + '% delivered)',
			inline: true
		});

		var stats = item.stats;

		if(stats)
			fields = fields.concat(item.stats);
	}

	msg.embed.fields = fields;

	bot.sendMessage(message, msg);
}

var description = {
	details: ['View what\'s playing']
};

var stats = {
	weight: 10
};

module.exports = {
	execute(bot, message, args){
		if(args.length)
			return {stats: {
				execute(bot, message){
					execute_internal(bot, message, true);
				}, description, stats
			}};
		else
			execute_internal(bot, message, false);
	}, description, stats, children: {
		stats: {
			description, stats
		}
	}
};
