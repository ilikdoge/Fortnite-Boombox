'use-strict';

const url = require('url');
const request = require('request');

var stateManager = new (class{
	constructor(){
		this.callbacks = [];
		this.fetching = false;
		this.ready = false;
		this.player_js;

		this.headers = {
			'x-youtube-client-name': '1'
		};

		this.account_data = {
			'cookie': ''
		};

		this.innertube = {};

		this.user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.17 Safari/537.36";
	}

	fetch(cb, cr){
		if(cr)
			this.ready = false;
		if(this.ready)
			return cb(null);
		this.callbacks.push(cb);

		if(!this.fetching){
			this.fetching = true;

			request({method: 'GET', url: 'https://www.youtube.com/', gzip: true, headers: {'user-agent': this.user_agent, ...this.account_data}}, (err, resp, body) => {
				if(err || resp.statusCode < 200 || resp.statusCode >= 400)
					return this.finish(new Error('Error parsing response from youtube'));
				var state = /ytcfg\.set\((\{[\s\S]+?\})\);/.exec(body);

				if(!state)
					return this.finish(new Error('Error parsing response from youtube'));
				try{
					state = JSON.parse(state[1]);
				}catch(e){
					return this.finish(new Error('Error parsing response from youtube'));
				}

				this.headers['x-youtube-page-label'] = state.PAGE_BUILD_LABEL;
				this.headers['x-youtube-client-version'] = state.INNERTUBE_CONTEXT_CLIENT_VERSION;
				this.headers['x-youtube-sts'] = state.STS;
				this.account_data['x-youtube-identity-token'] = state.ID_TOKEN;
				this.innertube.key = state.INNERTUBE_API_KEY;
				this.innertube.context = state.INNERTUBE_CONTEXT;

				this.player_js = state.PLAYER_JS_URL;
				this.ready = true;
				this.finish(null);

				decodeManager.get(this.player_js, () => {});
			});
		}
	}

	finish(err){
		while(this.callbacks.length)
			this.callbacks.shift()(err);
		this.fetching = false;
	}
});

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
		var key = path;

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

		this._last_used = key;
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
		var mime = /(video|audio|text)\/([a-zA-Z0-9]{3,4});(?:\+| )codecs="(.*?)"/.exec(stream.type);

		stream.type = {stream: mime[1], container: mime[2], codecs: mime[3]};

		return stream;
	});
};

const parseStreamDataStream = function(formats, array){
	for(var i = 0; i < formats.length; i++){
		var stream = {
			bitrate: formats[i].bitrate,
			fps: formats[i].fps
		};

		var mime = /(video|audio|text)\/([a-zA-Z0-9]{3,4});(?:\+| )codecs="(.*?)"/.exec(formats[i].mimeType);

		stream.type = {stream: mime[1], container: mime[2], codecs: mime[3]};
		stream.target_duration_sec = formats[i].targetDurationSec;

		var scipher = (formats[i].cipher || formats[i].signatureCipher);

		if(scipher){
			const cipher = {};
			var cipherArr = scipher.split('&');

			for(var j = 0; j < cipherArr.length; j++){
				var params = cipherArr[j].split('=');

				cipher[params[0]] = decodeURIComponent(params[1]);
			}

			stream.url = cipher.url;
			stream.s = cipher.s;
			stream.sp = cipher.sp;
		}else
			stream.url = formats[i].url;

		array.push(stream);
	}
};

const parseStreamData = function(playerResponse){
	var streams = {adaptive: [], standard: []};

	if(playerResponse.streamingData){
		const formats = playerResponse.streamingData.formats;
		const adaptive = playerResponse.streamingData.adaptiveFormats;

		if(formats)
			parseStreamDataStream(formats, streams.standard);
		if(adaptive)
			parseStreamDataStream(adaptive, streams.adaptive);
	}

	return streams;
};

const decodeSignatures = function(array, key){
	for(var i = 0; i < array.length; i++)
		if(array[i].sp && array[i].s)
			array[i].url += '&' + array[i].sp + '=' + decodeManager.decode(key, array[i].s);
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

	get(id, callback, ret = 0){
		stateManager.fetch((err) => {
			if(err)
				return callback(err, null);
			request({url: 'https://www.youtube.com/watch?v=' + id + '&pbj=1', "headers": {"user-agent": stateManager.user_agent, ...stateManager.headers, ...stateManager.account_data}, gzip: true}, (err, resp, data) => {
				if(err)
					return callback(err, null);
				if(resp.statusCode < 200 || resp.statusCode >= 400)
					return callback(new Error('response status ' + resp.statusCode), null);
				try{
					data = JSON.parse(data);
				}catch(e){
					if(ret)
						return callback(new Error('json parse error'), null);
					return stateManager.fetch((err) => {
						if(!err)
							this.get(id, callback, ret + 1);
						else
							callback(err, null);
					}, true);
				}

				if(data.reload)
					return stateManager.fetch((err) => {
						if(!err)
							this.get(id, callback, ret + 1);
						else
							callback(err, null);
					}, true);
				try{
					var response = getProperty(data, 'response');
					var playerResponse = getProperty(data, 'playerResponse');
					var status = playerResponse.playabilityStatus;

					if(status.status.toLowerCase() !== 'ok')
						return callback(new Error(status.status + ': ' + (status.reason || 'UNAVAILABLE')), null);
					var author = getProperty(response.contents.twoColumnWatchNextResults.results.results.contents, 'videoSecondaryInfoRenderer').owner.videoOwnerRenderer;
					var videoDetails = playerResponse.videoDetails;

					var config = getProperty(data, 'player');

					var jsasset;
					var dashmpd = null;
					var adaptive = [];
					var standard = [];

					if(config){
						jsasset = config.assets.js;
						dashmpd = config.args.dashmpd && config.args.dashmpd.replace(/s\/([A-Za-z0-9\.]+?)\//, function(match, p1){
							return 'signature/' + decodeManager.decode(key, p1);
						});

						if(config.args.adaptive_fmts)
							adaptive = parseStreams(config.args.adaptive_fmts);
						if(config.args.url_encoded_fmt_stream_map)
							standard = parseStreams(config.args.url_encoded_fmt_stream_map);
						var streamingData = parseStreamData(JSON.parse(config.args.player_response));

						adaptive = adaptive.concat(streamingData.adaptive);
						standard = standard.concat(streamingData.standard);
					}else{
						config = getProperty(data, 'playerResponse');
						jsasset = stateManager.player_js;

						var streamingData = parseStreamData(config);

						adaptive = streamingData.adaptive;
						standard = streamingData.standard;
					}

					decodeManager.get(jsasset, function(err, key){
						if(err)
							return callback(err, null);
						decodeSignatures(adaptive, key);
						decodeSignatures(standard, key);

						process.nextTick(() => {
							callback(null, new VideoResult(
								new Publisher(author.title.runs[0].text, thumbnails(author.thumbnail.thumbnails)),
								new Video(videoDetails.videoId, videoDetails.title, thumbnails(videoDetails.thumbnail.thumbnails), videoDetails.lengthSeconds ? parseInt(videoDetails.lengthSeconds, 10) : null),
								new VideoStreams(adaptive, standard, dashmpd, videoDetails.isLive)
							));
						});
					});
				}catch(e){
					return callback(new Error('Error parsing response from Youtube'), null);
				}
			});
		});
	}

	playlist(id, limit, callback){
		var count = 0;
		var pubcache = {};

		var addVideos = function(contents){
			var list = [];
			var token = null;

			for(var i = 0; i < contents.length; i++){
				if(contents[i].playlistVideoRenderer){
					var item = contents[i].playlistVideoRenderer;

					if(!item.isPlayable)
						continue;
					var pub = item.shortBylineText && item.shortBylineText.runs[0];
					var p = null;

					if(pub){
						var pubId = pub.navigationEndpoint.browseEndpoint.browseId;

						if(pubcache[pubId])
							p = pubcache[pubId];
						else
							pubcache[pubId] = p = new Publisher(pub.text);
					}

					list.push(new VideoResult(p, new Video(item.videoId, item.title.runs[0].text, thumbnails(item.thumbnail.thumbnails), item.lengthSeconds ? parseInt(item.lengthSeconds, 10) : null)));
				}else if(contents[i].continuationItemRenderer)
					token = contents[i].continuationItemRenderer.continuationEndpoint.continuationCommand.token;
			}

			count += contents.length;

			callback(null, list);

			return token;
		};

		var cont = function(continuation){
			request({method: 'POST', url: 'https://www.youtube.com/youtubei/v1/browse?key=' + stateManager.innertube.key, gzip: true, headers: {'Content-Type': 'application/json'}, body: JSON.stringify({continuation, context: stateManager.innertube.context})}, function(err, resp, data){
				if(err)
					return callback(null, list);
				if(resp.statusCode < 200 || resp.statusCode >= 400)
					return callback(new Error('response status ' + resp.statusCode), null);
				data = JSON.parse(data).onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems;

				var continuation = addVideos(data);

				if(continuation && (limit == 0 || count < limit))
					cont(continuation);
				else
					callback(null, {end: true});
			});
		};

		stateManager.fetch((err) => {
			if(err)
				return callback(err, null);
			request({url: 'https://www.youtube.com/playlist?pbj=1&list=' + id, headers: stateManager.headers, gzip: true}, function(err, resp, data){
				if(err)
					return callback(err, null);
				if(resp.statusCode < 200 || resp.statusCode >= 400)
					return callback(new Error('response status ' + resp.statusCode), null);
				try{
					data = JSON.parse(data)[1].response.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].playlistVideoListRenderer;
				}catch(e){
					return callback(new Error('Error parsing json data'), null);
				}

				var continuation = addVideos(data.contents);

				if(continuation && (limit == 0 || count < limit))
					cont(continuation);
				else
					callback(null, {end: true});
			});
		});
	}

	search(query, callback){
		stateManager.fetch((err) => {
			if(err)
				return callback(err, null);
			request({url: 'https://www.youtube.com/results?sp=EgIQAQ%253D%253D&pbj=1&search_query=' + encodeURIComponent(query), headers: stateManager.headers, gzip: true}, (err, resp, data) => {
				if(err)
					return callback(err, null);
				if(resp.statusCode < 200 || resp.statusCode >= 400)
					return callback(new Error('response status ' + resp.statusCode), null);
				try{
					data = JSON.parse(data)[1].response.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;
				}catch(e){
					return callback(new Error('json parse error'), null);
				}

				var results = [];

				for(var i = 0; i < data.length; i++){
					if(!data[i].itemSectionRenderer)
						continue;
					const list = data[i].itemSectionRenderer.contents;

					for(var j = 0; j < list.length; j++)
						if(list[j].videoRenderer){
							var item = list[j].videoRenderer;

							results.push(new VideoResult(
								new Publisher(item.shortBylineText && item.shortBylineText.runs[0].text, thumbnails((item.channelThumbnailSupportedRenderers && item.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer.thumbnail.thumbnails) || (item.channelThumbnail && item.channelThumbnail.thumbnails))),
								new Video(item.videoId, item.title.simpleText || item.title.runs[0].text, thumbnails(item.thumbnail.thumbnails), item.lengthText ? parseTimestamp(item.lengthText.simpleText) : null)
							));
						}
				}

				callback(null, results);
			});
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