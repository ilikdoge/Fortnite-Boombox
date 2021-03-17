'use-strict';

const url = require('url');
const request = require('request');

const headers = {
	'x-youtube-client-version': '2.20190223',
	'x-youtube-page-label': 'youtube.ytfe.desktop_20190222_8_RC1',
	'x-youtube-client-name': '1',
};

var account_data = {
	'x-youtube-identity-token': 'QUFFLUhqa2YtbUpmNDFmbXVJTHF4SS1TcFZJZzRNNDl1QXw=',
	'cookie': 'CONSENT=YES+US.en+20161030-06-0; VISITOR_INFO1_LIVE=9auYWWGpr6w; _ga=GA1.2.874515546.1531566518; PREF=f6=80002&f4=4000000&f5=30030&f3=8&f1=50000000&cvdm=grid&volume=100&al=en; wide=0; YSC=2sNmIZMRi94; SID=ygZivdKKTcgXO6goNykyp3kxE_ACGLLsF1ojuu-gUMhGm4UxV3GYxLnREJJ13zZv7qxSxA.; HSID=AINfN3PMFqKVqk_H0; SSID=AhkuXt4dQEHUsuKQB; APISID=fOvy9UAGG9hzLS6u/A4qeT8jrvbKzNzc0E; SAPISID=G-ALDCHmruCbhKL9/AtMmdBqwvXkSLH0nE; LOGIN_INFO=AFmmF2swRQIhAM466Nc4cvJF271TyOu7oZLShqWVlX4WdHrneAVI4RKLAiA87tEUXlCTeGOB8HkF7Qpc3uaP7jN7vhZB4ktEemwqsg:QUQ3MjNmeXRvTk90UlNZWjhjRFdzNTVRY1ZtVEFhT3NETXJEM1NXMGxVRzBwQjZ5V1M2ZHl5akhpN0Zob2pkdW55OVUxdm8tOVZzQUR1NTEzZElZNzFNRHBzTm81ZEx4cEpPQ3RxZWtQcTNTX2wzSnkyd0c5R0U4TERpUEdHX2ZmSFVxbVpoZEdPcERCbEZrNGxLRVA4ZmpxTWZkM1BSSzVnT0VpRFhid0pRTmMtVldKQzRMbGY4; ST-131d047=itct=CNcBEJQ1GAAiEwi8gLHJm4XfAhURgsQKHUHbAR8yCmctaGlnaC1yZWNaD0ZFd2hhdF90b193YXRjaA%3D%3D&csn=FfIFXMvGKsKRkwbA177ICQ'
};

var decodeManager = new (class{
	constructor(){
		this._cache = {};
		this._callbacks = {};
	}

	_finish(key, err, data){
		this._cache[key] = data;

		for(var i = 0; i < this._callbacks[key].length; i++)
			this._callbacks[key][i](err, key);
		delete this._callbacks[key];
	}

	_parse(body){
		var jsVarStr = '[a-zA-Z_\\$][a-zA-Z_0-9]*';
		var jsSingleQuoteStr = '\'[^\'\\\\]*(:?\\\\[\\s\\S][^\'\\\\]*)*\'';
		var jsDoubleQuoteStr = '"[^"\\\\]*(:?\\\\[\\s\\S][^"\\\\]*)*"';
		var jsQuoteStr = '(?:' + jsSingleQuoteStr + '|' + jsDoubleQuoteStr + ')';
		var jsKeyStr = '(?:' + jsVarStr + '|' + jsQuoteStr + ')';
		var jsPropStr = '(?:\\.' + jsVarStr + '|\\[' + jsQuoteStr + '\\])';
		var jsEmptyStr = '(?:\'\'|"")';
		var reverseStr = ':function\\(a\\)\\{' +
			'(?:return )?a\\.reverse\\(\\)' +
			'\\}';
		var sliceStr = ':function\\(a,b\\)\\{' +
			'return a\\.slice\\(b\\)' +
			'\\}';
		var spliceStr = ':function\\(a,b\\)\\{' +
			'a\\.splice\\(0,b\\)' +
			'\\}';
		var swapStr = ':function\\(a,b\\)\\{' +
			'var c=a\\[0\\];a\\[0\\]=a\\[b(?:%a\\.length)\\];a\\[b(?:%a\\.length)?\\]=c(?:;return a)?' +
			'\\}';
		var actionsDef = new RegExp('var (' + jsVarStr + ')=\\{((?:(?:' +
			jsKeyStr + reverseStr + '|' +
			jsKeyStr + sliceStr + '|' +
			jsKeyStr + spliceStr + '|' +
			jsKeyStr + swapStr + '),?\\r?\\n?)+)\\};');
		var actionsExec = new RegExp('function(?: ' + jsVarStr + ')?\\(a\\)\\{a=a\\.split\\(' +
			jsEmptyStr + '\\);\\s*((?:(?:a=)?' + jsVarStr + jsPropStr + '\\(a,\\d+\\);)+)return a\\.join\\(' +
			jsEmptyStr + '\\)\\}');
		var reverseS = new RegExp('(' + jsKeyStr + ')' + reverseStr, 'g');
		var sliceS = new RegExp('(' + jsKeyStr + ')' + sliceStr, 'g');
		var spliceS = new RegExp('(' + jsKeyStr + ')' + spliceStr, 'g');
		var swapS = new RegExp('(' + jsKeyStr + ')' + swapStr, 'g');
		var defs = actionsDef.exec(body);
		var acts = actionsExec.exec(body);
		var obj = defs[1].replace(/\$/g, '\\$');
		var objBody = defs[2].replace(/\$/g, '\\$');
		var funcBody = acts[1].replace(/\$/g, '\\$');
		var result = reverseS.exec(objBody);
		var reverseKey = result ? result[1].replace(/\$/g, '\\$').replace(/\$|^'|^"|'$|"$/g, '') : '';

		result = sliceS.exec(objBody);
		var sliceKey = result ? result[1].replace(/\$/g, '\\$').replace(/\$|^'|^"|'$|"$/g, ''): '';

		result = spliceS.exec(objBody);
		var spliceKey = result ? result[1].replace(/\$/g, '\\$').replace(/\$|^'|^"|'$|"$/g, '') : '';

		result = swapS.exec(objBody);
		var swapKey = result ? result[1].replace(/\$/g, '\\$').replace(/\$|^'|^"|'$|"$/g, '') : '';
		var keys = '(' + [reverseKey, sliceKey, spliceKey, swapKey].join('|') + ')';
		var tokenize = new RegExp('(?:a=)?' + obj + '(?:\\.' + keys + '|\\[\'' + keys + '\'\\]|\\["' + keys + '"\\])\\(a,(\\d+)\\)', 'g');
		var actions = [];

		var add = function(key, value){
			if(key == swapKey)
				actions.push(function(sig){
					var temp = sig[0];

					sig[0] = sig[value];
					sig[value] = temp;
				});
			else if(key == reverseKey)
				actions.push(function(sig){
					sig.reverse();
				});
			else if(key == sliceKey)
				actions.push(function(sig){
					sig.slice(value);
				});
			else if(key == spliceKey)
				actions.push(function(sig){
					sig.splice(0, value);
				});
		};

		while(result = tokenize.exec(funcBody))
			add(result[1] || result[2] || result[3], result[4]);
		return actions;
	}

	get(path, callback){
		var key = /(?:html5)?player[-_]([a-zA-Z0-9\-_]+)(?:\.js|\/)/.exec(path)[1];

		if(this._cache[key])
			return callback(null, key);
		if(this._callbacks[key])
			return this._callbacks[key].push(callback);
		this._callbacks[key] = [callback];

		request({url: 'https://www.youtube.com' + path, gzip: true}, (err, resp, body) => {
			if(err)
				return this._finish(key, err, null);
			if(resp.statusCode < 200 || resp.statusCode >= 400)
				return this._finish(key, new Error('response status ' + resp.statusCode), null);
			this._finish(key, null, this._parse(body));
		});
	}

	decode(key, sig){
		sig = sig.split('');

		for(var i = 0; i < this._cache[key].length; i++)
			this._cache[key][i](sig);
		return sig.join('');
	}
});

const getProperty = function(array, prop){
	for(var i = 0; i < array.length; i++)
		if(array[i][prop])
			return array[i][prop];
	return null;
};

const parseStreams = function(streams){
	if(!streams)
		return [];
	return streams.split(',').map(function(a){
		var params = a.split('&');
		var stream = {};

		for(var i = 0; i < params.length; i++){
			var names = params[i].split('=');

			stream[names[0]] = decodeURIComponent(names[1]);
		}

		if(stream.bitrate)
			stream.bitrate = parseInt(stream.bitrate, 10);
		if(stream.target_duration_sec)
			stream.target_duration_sec = parseFloat(stream.target_duration_sec);
		if(stream.fps)
			stream.fps = parseInt(stream.fps, 10);
		var mime = /(video|audio)\/([a-zA-Z0-9]{3,4});(?:\+| )codecs="(.*?)"/.exec(stream.type);

		stream.type = {stream: mime[1], container: mime[2], codecs: mime[3]};

		return stream;
	});
};

const decodeSignatures = function(array, key){
	for(var i = 0; i < array.length; i++)
		if(array[i].s)
			array[i].url += '&signature=' + decodeManager.decode(key, array[i].s);
};

const resolve = function(uri){
	return url.resolve('https://', uri);
};

const thumbnails = function(arr){
	if(!arr)
		return arr;
	for(var i = 0; i < arr.length; i++)
		arr[i].url = resolve(arr[i].url);
	return arr;
};

const parseTimestamp = function(str){
	var tokens = str.split(':').map(function(token){
		return parseInt(token, 10);
	});

	var scale = [1, 60, 3600, 86400];
	var seconds = 0;

	for(var i = tokens.length - 1; i >= 0; i--){
		if(!Number.isInteger(tokens[i]))
			return null;
		seconds += tokens[i] * scale[Math.min(3, tokens.length - i - 1)];
	}

	return seconds;
};

var api = new (class{
	constructor(){}

	get(id, callback){
		request({url: 'https://www.youtube.com/watch?v=' + id + '&pbj=1', headers: {...headers, ...account_data}, gzip: true}, (err, resp, data) => {
			if(err)
				return callback(err, null);
			if(resp.statusCode < 200 || resp.statusCode >= 400)
				return callback(new Error('response status ' + resp.statusCode), null);
			try{
				data = JSON.parse(data);
			}catch(e){
				return callback(new Error('json parse error'), null);
			}

			if(data.reload)
				return callback(new Error('headers expired'), null);
			try{
				var response = getProperty(data, 'response');
				var playerResponse = getProperty(data, 'playerResponse');
				var status = playerResponse.playabilityStatus;

				if(status.status.toLowerCase() !== 'ok')
					return callback(new Error(status.status + ': ' + (status.reason || 'UNAVAILABLE')), null);
				var author = getProperty(response.contents.twoColumnWatchNextResults.results.results.contents, 'videoSecondaryInfoRenderer').owner.videoOwnerRenderer;
				var videoDetails = playerResponse.videoDetails;
				var config = getProperty(data, 'player');
				var adaptive = parseStreams(config.args.adaptive_fmts);
				var standard = parseStreams(config.args.url_encoded_fmt_stream_map);

				decodeManager.get(config.assets.js, function(err, key){
					if(err)
						return callback(err, null);
					decodeSignatures(adaptive, key);
					decodeSignatures(standard, key);

					callback(null, new VideoResult(
						new Publisher(author.title.runs[0].text, thumbnails(author.thumbnail.thumbnails)),
						new Video(videoDetails.videoId, videoDetails.title, thumbnails(videoDetails.thumbnail.thumbnails), videoDetails.lengthSeconds ? parseInt(videoDetails.lengthSeconds, 10) : null),
						new VideoStreams(adaptive, standard, config.args.dashmpd && config.args.dashmpd.replace(/s\/([A-Za-z0-9\.]+?)\//, function(match, p1){
							return 'signature/' + decodeManager.decode(key, p1);
						}), config.args.live_playback ? true : false)
					));
				});
			}catch(e){
				return callback(new Error('error parsing data'), null);
			}
		});
	}

	playlist(id, limit, callback){
		var count = 0;
		var pubcache = {};

		var addVideos = function(contents){
			var list = [];

			for(var i = 0; i < contents.length; i++){
				var item = contents[i].playlistVideoRenderer;
				var pub = item.shortBylineText && item.shortBylineText.runs[0];
				var p = null;

				if(pub){
					var pubId = pub.navigationEndpoint.browseEndpoint.browseId;

					if(pubcache[pubId])
						p = pubcache[pubId];
					else
						pubcache[pubId] = p = new Publisher(pub.text);
				}

				list.push(new VideoResult(p, new Video(item.videoId, item.title.simpleText, thumbnails(item.thumbnail.thumbnails), item.lengthSeconds ? parseInt(item.lengthSeconds, 10) : null)));
			}

			count += contents.length;

			callback(null, list);
		};

		var cont = function(continuation){
			request({url: 'https://www.youtube.com/browse_ajax?ctoken=' + continuation + '&continuation=' + continuation, headers, gzip: true}, function(err, resp, data){
				if(err)
					return callback(null, list);
				if(resp.statusCode < 200 || resp.statusCode >= 400)
					return callback(new Error('response status ' + resp.statusCode), null);
				data = JSON.parse(data)[1].response.continuationContents.playlistVideoListContinuation;

				addVideos(data.contents);

				if(data.continuations && (limit == 0 || count < limit))
					cont(data.continuations[0].nextContinuationData.continuation);
				else
					callback(null, {end: true});
			});
		};

		request({url: 'https://www.youtube.com/playlist?list=' + id + '&pbj=1', headers, gzip: true}, function(err, resp, data){
			if(err)
				return callback(err, null);
			if(resp.statusCode < 200 || resp.statusCode >= 400)
				return callback(new Error('response status ' + resp.statusCode), null);
			try{
				data = JSON.parse(data)[1].response.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].playlistVideoListRenderer;
			}catch(e){
				return callback(new Error('Error parsing json data'), null);
			}

			addVideos(data.contents);

			if(data.continuations && (limit == 0 || count < limit))
				cont(data.continuations[0].nextContinuationData.continuation);
			else
				callback(null, {end: true});
		});
	}

	search(query, callback){
		request({url: 'https://www.youtube.com/results?&search_query=' + encodeURIComponent(query) + '&sp=EgIQAQ%253D%253D&pbj=1', headers, gzip: true}, (err, resp, data) => {
			if(err)
				return callback(err, null);
			if(resp.statusCode < 200 || resp.statusCode >= 400)
				return callback(new Error('response status ' + resp.statusCode), null);
			try{
				data = JSON.parse(data)[1].response.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents;
			}catch(e){
				return callback(new Error('json parse error'), null);
			}

			var results = [];

			for(var i = 0; i < data.length; i++)
				if(data[i].videoRenderer){
					var item = data[i].videoRenderer;

					results.push(new VideoResult(
						new Publisher(item.shortBylineText.runs[0].text, thumbnails((item.channelThumbnailSupportedRenderers && item.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer.thumbnail.thumbnails) || (item.channelThumbnail && item.channelThumbnail.thumbnails))),
						new Video(item.videoId, item.title.simpleText, thumbnails(item.thumbnail.thumbnails), item.lengthText ? parseTimestamp(item.lengthText.simpleText) : null)
					));
				}
			callback(null, results);
		});
	}
});

class Video{
	constructor(id, title, thumbnails, duration){
		this.id = id;
		this.title = title;
		this.thumbnails = thumbnails;
		this.duration = duration;
	}
}

class Publisher{
	constructor(name, thumbs){
		this.name = name;
		this.thumbnails = thumbs;
	}
}

class VideoStreams{
	constructor(adaptive, standard, dash, live){
		this.adaptive = adaptive;
		this.standard = standard;
		this.dash = dash;
		this.live = live;
	}
}

class VideoResult{
	constructor(publisher, video, streams = null){
		this.publisher = publisher;
		this.video = video;
		this.streams = streams;
	}

	getStreams(callback){
		if(this.streams)
			return callback(null, this.streams);
		api.get(this.video.id, (err, data) => {
			if(err)
				return callback(err, null);
			this.streams = data.streams;
			this.publisher = data.publisher;
			this.video = data.video;

			callback(null, this.streams);
		});
	}
}

module.exports = api;