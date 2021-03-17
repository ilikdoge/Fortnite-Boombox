const os = require('os');

module.exports = {
	execute(bot, message){
		var cpuModels = {};
		var cpus = os.cpus();
		var avg = os.loadavg();

		for(var i = 0; i < cpus.length; i++)
			if(cpuModels[cpus[i].model])
				cpuModels[cpus[i].model]++;
			else
				cpuModels[cpus[i].model] = 1;
		var models = [];

		for(var i in cpuModels)
			models.push(cpuModels[i] + ' x ' + i);
		var mem = process.memoryUsage();

		bot.sendMessage(message, {embed: {
			fields: [{
				name: 'RAM Usage (Extern / Heap / RSS)',
				value: (mem.external / 1048576).toFixed(2) + 'MB / ' + (mem.heapUsed / 1048576).toFixed(2) + 'MB / ' + (mem.rss / 1048576).toFixed(2) + 'MB'
			}, {
				name: 'CPU(s)',
				value: models.join('\n'),
				inline: true
			}, {
				name: 'Average application load (1 / 5 / 15 minute(s))',
				value: (avg[0] * 100).toFixed(2) + '% / ' + (avg[1] * 100).toFixed(2) + '% / ' + (avg[2] * 100).toFixed(2) + '%'
			}, {
				name: 'Streaming to',
				value: bot.streaming + ' out of ' + bot.client.guilds.size + ' servers'
			}]
		}, timeout: 8000});
	}, description: {
		details: [
			'View performance of the bot'
		]
	}, stats: {
		weight: 10
	}
};