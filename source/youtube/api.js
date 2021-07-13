const crypto = require('crypto');

const nfetch = require('node-fetch');

const httpsAgent = new (require('https').Agent)({keepAlive: true});
const httpAgent = new (require('http').Agent)({keepAlive: true});

const errors = {
	NETWORK_ERROR: {
		message: 'Network error',
		code: 1
	},

	INVALID_RESPONSE: {
		message: 'Invalid response from host',
		code: 2
	},

	INTERNAL_ERROR: {
		message: 'Internal error',
		code: 3
	},

	NOT_FOUND: {
		message: 'Not found',
		code: 4
	},

	UNPLAYABLE: {
		message: 'Unplayable',
		code: 5
	}
};

const errorCode = {};

for(const name in errors)
	errorCode[errors[name].code] = errors[name];

class SourceError extends Error{
	constructor(code, message, error){
		super(message || errorCode[code].message);

		this.code = code;

		if(error){
			this.stack = error.stack;
			this.details = error.message;
		}
	}
}

SourceError.codes = {};

for(const name in errors){
	SourceError[name] = SourceError.bind(null, errors[name].code);
	SourceError.codes[name] = errors[name].code;
}

const fetch = function(url, opts = {}){
	opts.agent = new URL(url).protocol == 'https:' ? httpsAgent : httpAgent;

	return nfetch(url, opts);
};

const Request = new class{
	async getResponse(url, options){
		var res;

		try{
			res = await fetch(url, options);
		}catch(e){
			throw new SourceError.NETWORK_ERROR(null, e);
		}

		return {res};
	}

	async get(url, options){
		const {res} = await this.getResponse(url, options);

		var body;

		try{
			body = await res.text();
		}catch(e){
			if(!res.ok)
				throw new SourceError.INTERNAL_ERROR(null, e);
			throw new SourceError.NETWORK_ERROR(null, e);
		}

		if(!res.ok)
			throw new SourceError.INTERNAL_ERROR(null, new Error(body));
		return {res, body};
	}

	async getJSON(url, options){
		const data = await this.get(url, options);

		try{
			data.body = JSON.parse(data.body);
		}catch(e){
			throw new SourceError.INVALID_RESPONSE(null, e);
		}

		return data;
	}

	async getBuffer(url, options){
		const {res} = await this.getResponse(url, options);

		var body;

		try{
			body = await res.buffer();
		}catch(e){
			if(!res.ok)
				throw new SourceError.INTERNAL_ERROR(null, e);
			throw new SourceError.NETWORK_ERROR(null, e);
		}

		if(!res.ok)
			throw new SourceError.INTERNAL_ERROR(null, new Error(body.toString('utf8')));
		return {res, body};
	}
};

/* manages api requests and headers to youtube.com */
const youtubeInterface = new (class{
	constructor(){
		this.account_data = {
			'cookie': ''
		};

		this.needs_reload = false;
		this.player_js = null;
		this.headers = {};
		this.innertube = {};
		this.sapisid = '';
		this.reload();

		setInterval(() => {
			this.reload();
		}, 24 * 60 * 60 * 1000);
	}

	async reload(){
		/* has our request headers expired? */
		if(this.data){
			this.needs_reload = true;

			return;
		}

		this.needs_reload = false;
		this.data = this.do();

		try{
			await this.data;
		}catch(e){

		}

		this.data = null;

		if(this.needs_reload)
			this.reload();
	}

	async fetch(){
		if(this.data)
			await this.data;
	}

	async do(){
		const {res, body} = await Request.get('https://www.youtube.com/', {headers: this.account_data});

		var state = /ytcfg\.set\((\{[\s\S]+?\})\);/.exec(body);

		if(!state)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Could not find state object'));
		try{
			state = JSON.parse(state[1]);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, new Error('Could not parse state object'));
		}

		this.signatureTimestamp = state.STS;
		this.headers['x-youtube-client-version'] = state.INNERTUBE_CONTEXT_CLIENT_VERSION;
		this.headers['x-youtube-client-name'] = state.INNERTUBE_CONTEXT_CLIENT_NAME;
		this.innertube.key = state.INNERTUBE_API_KEY;
		this.innertube.context = state.INNERTUBE_CONTEXT;
		this.player_js = state.PLAYER_JS_URL;

		if(!state.INNERTUBE_CONTEXT_CLIENT_VERSION || !state.INNERTUBE_CONTEXT_CLIENT_NAME || !state.STS ||
			!this.innertube.key || !this.innertube.context || !this.player_js)
				throw new SourceError.INTERNAL_ERROR(null, new Error('Missing state fields'));
		await this.load(this.player_js);
	}

	parse(body){
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

		while(result = tokenize.exec(funcBody)){
			const key = result[1] || result[2] || result[3];
			const val = result[4];

			if(key == reverseKey)
				this.decodeData.push(0);
			else{
				if(key == swapKey)
					this.decodeData.push(1);
				else if(key == sliceKey)
					this.decodeData.push(2);
				else if(key == spliceKey)
					this.decodeData.push(3);
				this.decodeData.push(parseInt(val, 10));
			}
		}
	}

	async load(path){
		const {res, body} = await Request.get('https://www.youtube.com' + path);

		this.decodeData = [];
		this.parse(body);
	}

	decode(sig){
		sig = sig.split('');

		for(var i = 0; i < this.decodeData.length; i++){
			const key = this.decodeData[i];

			if(key == 0)
				sig.reverse();
			else{
				const value = this.decodeData[++i];

				switch(key){
					case 1:
						const temp = sig[0];

						sig[0] = sig[value];
						sig[value] = temp;

						break;
					case 2:
						sig.slice(value);

						break;
					case 3:
						sig.splice(0, value);

						break;
				}
			}
		}

		return sig.join('');
	}

	async makeApiRequest(path, body = {}){
		/* youtube v1 api */
		await this.fetch();

		const options = {};
		var time = Math.floor(Date.now() / 1000);

		body.context = this.innertube.context;
		options.method = 'POST';

		if(options.headers)
			options.headers = {...options.headers, ...this.account_data, ...this.headers};
		else
			options.headers = {...this.account_data, ...this.headers};
		if(this.sapisid)
			options.headers.authorization = 'SAPISIDHASH ' + time + '_' + crypto.createHash('sha1').update(time + ' ' + this.sapisid + ' https://www.youtube.com').digest('hex');
		options.headers.origin = 'https://www.youtube.com';
		options.body = JSON.stringify(body);

		var {res} = await Request.getResponse('https://www.youtube.com/youtubei/v1/' + path + '?key=' + this.innertube.key, options);
		var body;

		try{
			body = await res.text();
		}catch(e){
			if(!res.ok)
				throw new SourceError.INTERNAL_ERROR(null, e);
			throw new SourceError.NETWORK_ERROR(null, e);
		}

		if(res.status >= 400 && res.status < 500)
			throw new SourceError.NOT_FOUND(null, new Error(body));
		if(!res.ok)
			throw new SourceError.INTERNAL_ERROR(null, e);
		try{
			body = JSON.parse(body);
		}catch(e){
			throw new SourceError.INVALID_RESPONSE(null, e);
		}

		return body;
	}

	async makePlayerRequest(id){
		return await this.makeApiRequest('player', {videoId: id, playbackContext: {contentPlaybackContext: {signatureTimestamp: this.signatureTimestamp}}})
	}

	async setCookie(cookiestr){
		var cookies = cookiestr.split(';');
		var map = new Map();

		for(var cookie of cookies){
			cookie = cookie.trim().split('=');
			map.set(cookie[0], cookie[1]);
		}

		this.sapisid = map.get('SAPISID') || map.get('__Secure-3PAPISID') || '';
		this.account_data.cookie = cookiestr;
		this.reload();
	}
});

function getProperty(array, prop){
	if(!(array instanceof Array))
		return null;
	for(const item of array)
		if(item && item[prop])
			return item[prop];
	return null;
}

function parseStreamDataStream(formats, array){
	for(const fmt of formats){
		if(fmt.type == 'FORMAT_STREAM_TYPE_OTF')
			continue;
		var stream = {
			bitrate: fmt.bitrate,
			itag: fmt.itag,
			lmt: parseInt(fmt.lastModified, 10),
			duration: parseInt(fmt.approxDurationMs, 10) / 1000,
			mime: fmt.mimeType,
			target_duration_sec: parseFloat(fmt.target_duration_sec)
		};

		var mime = /(video|audio|text)\/([a-zA-Z0-9]{3,4});(?:\+| )codecs="(.*?)"/.exec(fmt.mimeType);

		stream.type = {stream: mime[1], container: mime[2], codecs: mime[3]};

		var scipher = (fmt.cipher || fmt.signatureCipher);

		if(scipher){
			const cipher = {};
			const cipherArr = scipher.split('&');

			for(var j = 0; j < cipherArr.length; j++){
				var params = cipherArr[j].split('=');

				cipher[params[0]] = decodeURIComponent(params[1]);
			}

			stream.url = cipher.url + '&' + cipher.sp + '=' + youtubeInterface.decode(cipher.s);
		}else
			stream.url = fmt.url;
		array.push(stream);
	}
}

function parseStreamData(playerResponse){
	var streams = {adaptive: [], standard: []};

	if(playerResponse.streamingData){
		const formats = playerResponse.streamingData.formats;
		const adaptive = playerResponse.streamingData.adaptiveFormats;

		if(formats)
			parseStreamDataStream(formats, streams.standard);
		if(adaptive)
			parseStreamDataStream(adaptive, streams.adaptive);
		streams.live = playerResponse.videoDetails.isLive;
	}

	return streams;
}

function parseTimestamp(str){
	var tokens = str.split(':').map((token) => parseInt(token, 10));

	var scale = [1, 60, 3600, 86400];
	var seconds = 0;

	for(var i = tokens.length - 1; i >= 0; i--){
		if(!Number.isInteger(tokens[i]))
			return 0;
		seconds += tokens[i] * scale[Math.min(3, tokens.length - i - 1)];
	}

	return seconds;
}

function text(txt){
	if(!txt)
		return null;
	if(txt.simpleText)
		return txt.simpleText;
	if(txt.runs)
		return txt.runs[0].text;
	return '';
}

function checkPlayable(st){
	if(!st)
		return;
	const {status, reason} = st;

	if(!status)
		return;
	switch(status.toLowerCase()){
		case 'ok':
			return;
		case 'error':
			if(reason == 'Video unavailable')
				throw new SourceError.NOT_FOUND('Video not found');
		case 'unplayable':
		case 'login_required':
			throw new SourceError.UNPLAYABLE(reason || status);
	}
}

function number(n){
	n = parseInt(n, 10);

	if(Number.isFinite(n))
		return n;
	return 0;
}

class TrackResults extends Array{
	async next(){
		throw new Error('Unimplemented');
	}
}

class TrackPlaylist extends TrackResults{
	setMetadata(title, description){
		this.title = title;
		this.description = description;
	}
}

class YoutubeResults extends TrackResults{
	setContinuation(cont){
		this.continuation = cont;
	}

	async next(){
		if(this.continuation)
			return api.search(null, this.continuation);
		return null;
	}
}

class YoutubePlaylist extends TrackPlaylist{
	setContinuation(cont){
		this.continuation = cont;
	}

	async next(){
		if(this.continuation)
			return api.search(null, this.continuation);
		return null;
	}
}

const api = new (class{
	constructor(){}

	async get(id, retries = 0){
		var responses = [
			youtubeInterface.makeApiRequest('next', {videoId: id}),
			youtubeInterface.makePlayerRequest(id)
		];

		try{
			responses = await Promise.all(responses);
		}catch(e){
			if(e.code == SourceError.codes.NOT_FOUND){
				e.message = 'Video not found';

				throw e;
			}

			if(retries)
				throw e;
			youtubeInterface.reload();

			return await this.get(id, retries + 1);
		}

		const response = responses[0];
		const playerResponse = responses[1];

		if(!response || !playerResponse)
			throw new SourceError.INTERNAL_ERROR(null, new Error('Missing data'));
		checkPlayable(playerResponse.playabilityStatus);

		try{
			const author = getProperty(response.contents.twoColumnWatchNextResults.results.results.contents, 'videoSecondaryInfoRenderer').owner.videoOwnerRenderer;
			const videoDetails = playerResponse.videoDetails;
			const streams = parseStreamData(playerResponse);

			return new VideoResult(
				new Publisher(text(author.title), author.thumbnail.thumbnails),
				new Video(
					videoDetails.videoId,
					videoDetails.title,
					videoDetails.thumbnail.thumbnails,
					number(videoDetails.lengthSeconds)
				),
				new VideoStreams(streams.adaptive, streams.standard, null, streams.live)
			);
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async playlistOnce(id, continuation){
		const results = new YoutubePlaylist();
		const body = {};

		if(continuation)
			body.continuation = continuation;
		else
			body.browseId = 'VL' + id;
		var data = await youtubeInterface.makeApiRequest('browse', body);

		if(continuation){
			if(!data.onResponseReceivedActions)
				throw new SourceError.NOT_FOUND('Playlist continuation token not found');
			try{
				data = data.onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems;
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
		}else{
			try{
				const details = getProperty(data.sidebar.playlistSidebarRenderer.items, 'playlistSidebarPrimaryInfoRenderer');

				data = data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].playlistVideoListRenderer.contents;
				results.setMetadata(text(details.title), text(details.description))
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
		}

		try{
			for(var item of data){
				if(item.continuationItemRenderer)
					results.setContinuation(item.continuationItemRenderer.continuationEndpoint.continuationCommand.token);
				else if(item.playlistVideoRenderer){
					item = item.playlistVideoRenderer;

					if(!item.isPlayable)
						continue;
					results.push(new VideoResult(
						new Publisher(text(item.shortBylineText), null),
						new Video(item.videoId,
							text(item.title),
							item.thumbnail.thumbnails,
							number(item.lengthSeconds)
						)
					));
				}
			}

			return results;
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	async playlist(id, limit){
		var list = [];
		var continuation = null;

		do{
			const result = await this.playlistOnce(id, continuation);

			list = list.concat(result);
			continuation = result.continuation;
		}while(continuation && (!limit || list.length < limit));

		return list;
	}

	async search(query, continuation){
		var body = await youtubeInterface.makeApiRequest('search', continuation ? {continuation} : {query, params: 'EgIQAQ%3D%3D'});

		if(continuation){
			if(!body.onResponseReceivedCommands)
				throw new SourceError.NOT_FOUND('Search continuation token not found');
			try{
				body = body.onResponseReceivedCommands[0].appendContinuationItemsAction.continuationItems;
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
		}else{
			try{
				body = body.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;
			}catch(e){
				throw new SourceError.INTERNAL_ERROR(null, e);
			}
		}

		const results = new YoutubeResults();

		try{
			for(const item of body){
				if(item.continuationItemRenderer)
					results.setContinuation(item.continuationItemRenderer.continuationEndpoint.continuationCommand.token);
				else if(item.itemSectionRenderer){
					const list = item.itemSectionRenderer.contents;

					for(var video of list)
						if(video.videoRenderer){
							video = video.videoRenderer;

							var thumbs;

							if(video.channelThumbnailSupportedRenderers)
								thumbs = video.channelThumbnailSupportedRenderers.channelThumbnailWithLinkRenderer.thumbnail.thumbnails;
							else if(video.channelThumbnail)
								thumbs = video.channelThumbnail.thumbnails;
							results.push(new VideoResult(
								new Publisher(text(video.shortBylineText), thumbs),
								new Video(video.videoId,
									text(video.title),
									video.thumbnail.thumbnails,
									video.lengthText ? parseTimestamp(video.lengthText.simpleText) : 0)
							));
						}
				}
			}

			return results;
		}catch(e){
			throw new SourceError.INTERNAL_ERROR(null, e);
		}
	}

	setCookie(cookie){
		youtubeInterface.setCookie(cookie);
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
		ytapi.get(this.video.id, (err, data) => {
			if(err)
				return callback(err, null);
			this.streams = data.streams;
			this.publisher = data.publisher;
			this.video = data.video;

			callback(null, this.streams);
		});
	}
}

const ytapi = new class{
	get(id, callback){
		api.get(id).then((result) => {
			callback(null, result);
		}).catch((err) => {
			callback(new Error(err.message), null);
		});
	}

	playlist(id, limit, callback){
		api.playlist(id, limit).then((result) => {
			callback(null, result);
			callback(null, {end: true});
		}).catch((err) => {
			callback(new Error(err.message), null);
		});
	}

	search(query, callback){
		api.search(query).then((result) => {
			callback(null, result);
		}).catch((err) => {
			callback(new Error(err.message), null);
		});
	}
};

module.exports = ytapi;