const messages = require('../common/messages');
const similarity = require('string-similarity');

module.exports = {
	execute(bot, message, args){
		if(args.length){
			if(args[0] == bot.prefix.default)
				args.shift();
			var node = {children: bot.commands};
			var past = [bot.prefix.default];

			while(node){
				if(args.length && node.children){
					var param = args[0].toLowerCase();

					if(node.children[param]){
						node = node.children[param];
						past.push(param);
						args.shift();
					}else
						break;
				}else
					break;
			}

			if(node.description)
				bot.sendMessage(message, messages.help.description(past.join(' '), node.description));
			else{
				var corr = null;

				if(node.children)
					node = node.children;
				var avail = [];

				for(var i in node)
					avail.push(i);
				past.splice(1, 0, 'help');
				past = past.join(' ');

				if(args.length && args[0].length <= 30)
					corr = past + ' ' + similarity.findBestMatch(args[0], avail).bestMatch.target;
				for(var i = 0; i < avail.length; i++)
					avail[i] = past + ' ' + avail[i];
				bot.sendMessage(message, messages.help.correction(corr, avail));
			}
		}else
			bot.sendMessage(message, messages.help.base(bot.prefix.default));
	}, description: {
		details: ['View basic commands or help on a specific command'],
		syntax: ['commandName'],
		examples: [
			'play yt',
			'help',
			'settings'
		]
	}, stats: {
		weight: 40
	}
}