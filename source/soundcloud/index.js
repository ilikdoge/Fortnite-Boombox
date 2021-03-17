"use-strict";

const request = require('request');

var api = new (class {
	constructor(clientId){
		this.clientId = clientId;
	}

	_makeResultFromTrack(track){
		return new MediaResult(
			track.permalink_url,
			new Publisher(track.user.username, track.user.avatar_url),
			new Metadata(track.title, track.artwork_url, track.duration / 1000),
			track.id
		);
	}

	_fetchTracks(tracks, callback){
		var tr = [];

		for(var i = 0; i < tracks.length; i++)
			tr.push(tracks[i].id);
		request({method: 'GET', url: 'https://api-v2.soundcloud.com/tracks?ids=' + tr.join(encodeURIComponent(',')) + '&client_id=' + this.clientId}, (err, resp, body) => {
			if(err)
				callback(err, null);
			if(resp.statusCode < 200 || resp.statusCode >= 400)
				return callback(new Error('Error ' + resp.statusCode), null);
			var data = JSON.parse(body);

			for(var i = 0; i < data.length; i++)
				data[i] = this._makeResultFromTrack(data[i]);
			callback(null, data);
		});
	}

	get(url, callback){
		request({method: 'GET', url: 'https://api-v2.soundcloud.com/resolve?url=' + encodeURIComponent(url) + '&client_id=' + this.clientId}, (err, resp, body) => {
			if(err)
				return callback(err, null);
			if(resp.statusCode < 200 || resp.statusCode >= 400)
				return callback(new Error('Error ' + resp.statusCode), null);
			var data = JSON.parse(body);

			if(data.kind == 'track')
				callback(null, {track: this._makeResultFromTrack(data)});
			else if(data.tracks){
				var results = [];
				var rf = [];

				for(var i = 0; i < data.tracks.length; i++)
					if(data.tracks[i].user && data.tracks[i].id)
						results.push(this._makeResultFromTrack(data.tracks[i]));
					else
						rf.push(data.tracks[i]);
				if(rf.length)
					this._fetchTracks(rf, (err, data) => {
						if(err)
							return callback(err, null);
						callback(null, {playlist: results.concat(data)});
					})
				else
					callback(null, {playlist: results});
			}else
				callback(new Error('Unsupported soundcloud type ' + data.kind), null);
		});
	}

	search(query, limit = 20, callback){
		request({method: 'GET', url: 'https://api-v2.soundcloud.com/search/tracks?q=' + encodeURIComponent(query) + '&client_id=' + this.clientId + '&limit=' + limit + '&offset=0'}, (err, resp, body) => {
			if(err)
				return callback(err, null);
			if(resp.statusCode < 200 || resp.statusCode >= 400)
				return callback(new Error('Error ' + resp.statusCode), null);
			var data = JSON.parse(body).collection;
			var results = [];

			for(var i = 0; i < data.length; i++)
				results.push(this._makeResultFromTrack(data[i]));
			callback(null, results);
		});
	}

	getTrack(id, callback){
		request({method: 'GET', url: 'https://api.soundcloud.com/tracks/' + id + '/streams?client_id=' + this.clientId}, (err, resp, body) => {
			if(err)
				return callback(err, null);
			if(resp.statusCode < 200 || resp.statusCode >= 400)
				return callback(new Error('Error ' + resp.statusCode), null);
			var data = JSON.parse(body);

			callback(null, new Streams(data.hls_mp3_128_url, data.hls_opus_64_url, data.http_mp3_128_url));
		});
	}
})('037KUNzb1U3CobuUwBh8X5TyDij9joQ0');

class Publisher{
	constructor(name, icon){
		this.name = name;
		this.icon = icon;
	}
}

class Metadata{
	constructor(title, thumbnail, duration){
		this.title = title;
		this.thumbnail = thumbnail;
		this.duration = duration;
	}
}

class Streams{
	constructor(hlsmp3, hlsopus, httpmp3){
		this.hlsmp3 = hlsmp3;
		this.hlsopus = hlsopus;
		this.httpmp3 = httpmp3;
	}
}

class MediaResult{
	constructor(permaurl, publisher, metadata, trackUrl){
		this.permaurl = permaurl;
		this.publisher = publisher;
		this.metadata = metadata;
		this.trackUrl = trackUrl;
		this.streams = null;
	}

	getStreams(callback){
		if(this.streams)
			return callback(null, this.streams);
		api.getTrack(this.trackUrl, (err, data) => {
			this.streams = data;

			callback(err, data);
		});
	}
}

module.exports = api;