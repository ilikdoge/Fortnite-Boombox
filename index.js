'use-strict';

const fs = require('fs');
var Bot = require('./bot');

/* begin logging */

global.debug = function(source, type, ...message){
	console.log('%c' + source + ' %c[' + type + ']', 'color: #9e42f4', 'color: #00f', ...message);
};

global.totalReceived = 0;

global.size = function(){
	var bytes = global.totalReceived;
	if(bytes == 0)
		return '0B';
	var pbm = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'];
	var s = Math.floor(Math.floor(Math.log10(parseInt(bytes, 10))) / 3);

	return Math.round(bytes * 100 / Math.pow(1000, s)) / 100 + pbm[s] + 'B';
};

var size = function(bytes){
	if(bytes == 0)
		return '0B';
	var pbm = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'];
	var s = Math.floor(Math.floor(Math.log10(parseInt(bytes, 10))) / 3);

	return Math.round(bytes * 100 / Math.pow(1000, s)) / 100 + pbm[s] + 'B';
};

function logHTTP(httpModule){
	var request = httpModule.request;

    httpModule.request = function(options, callback){
		debug('HTTP', options.method, options.href || (options.proto + "://" + options.host + options.path));

		var req = request(options, callback);

		req.on('response', (resp) => {
			var curRec = 0;

			resp.on('data', (data) => {
				global.totalReceived += data.byteLength;
				curRec += data.byteLength;
			});

			resp.on('end', () => {
				debug('HTTP', options.method, options.href || (options.proto + "://" + options.host + options.path), 'finished after receiving ' + size(curRec));
			});
		});

		return req;
    }
}

logHTTP(require('http'));
logHTTP(require('https'));

/* end logging */


const devs = {'731493379564634163': true};

function reload(){
	// for(var i in require.cache)
	// 	delete require.cache[i];
	// Bot = require('./bot');
}

function save(){

}

fs.readFile('bot_files/config.json', function(err, data){
	if(err)
		throw err;
	var config;

	try{
		config = JSON.parse(data);
	}catch(e){
		throw e;
	}

	var bots = {};

	var setup = function(data){
		var pb = bots[data.token];

		var bot = new Bot(data.token, {prefix: {short: data.prefix[0], default: data.prefix[1]},
			alexa: data.alexa, /*settings: settings, binds: binds,*/ dev: devs,
			color: data.color});//, mpdata: pb && pb.mediaPlayer._data});
		bot.once('destroyed', function(){
			reload();
			setup(data);
		});

		bots[data.token] = bot;
	};

	for(var i = 0; i < config.length; i++)
		setup(config[i]);
	process.on('uncaughtException', function(e){
		console.error.apply(console, [e.message, e.stack]);

		for(var i in bots)
			bots[i].destroy();
	});
});