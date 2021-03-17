"use-strict";

const request = require('request');

var api = new (class{
	get(id, callback){
		request('https://www.instagram.com/p/' + id + '/?__a=1', (err, resp, body) => {
			if(err)
				return callback(err, null);
			if(resp.statusCode < 200 || resp.statusCode >= 400)
				return callback(new Error('Error ' + resp.statusCode), null);//catch errors
			body = JSON.parse(body).graphql.shortcode_media;

			var publisher = new Publisher(body.owner.username, body.owner.profile_pic_url);
			var title = body.edge_media_to_caption.edges.length && body.edge_media_to_caption.edges[0].node.text;
			var id = body.shortcode;

			if(body.is_video && body.video_url)
				callback(null, {video: new Result(body.video_url, id, publisher, new Metadata(title, body.display_resources[0].src, body.video_duration), id)});
			else if(body.edge_sidecar_to_children && body.edge_sidecar_to_children.edges.length){
				var children = body.edge_sidecar_to_children.edges;
				var results = [];

				for(var i = 0; i < children.length; i++){
					var child = children[i].node;

					if(child.is_video && child.video_url)
						results.push(new Result(child.video_url, id, publisher, new Metadata(title, child.display_resources[0].src, null), child.shortcode));
				}

				if(results.length == 0)
					callback(new Error('No video found'), null);
				else
					callback(null, {collection: results});
			}else
				callback(new Error('No video found'), null);
		});
	}
});

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

class Result{
	constructor(url, id, publisher, metadata, shortcode){
		this.url = url;
		this.id = id;
		this.publisher = publisher;
		this.metadata = metadata;
		this.shortcode = shortcode;
	}

	getUrl(callback){
		if(this.url)
			return callback(null, this.url);
		api.get(this.id, (err, data) => {
			if(err)
				return callback(err, null);
			if(data.video){
				if(data.video.shortcode == this.shortcode)
					return callback(null, this.url = data.video.url);
				callback(new Error('Video not found'), null);
			}else if(data.collection){
				for(var i = 0; i < data.collection.length; i++)
					if(data.collection[i].shortcode == this.shortcode)
						return callback(null, this.url = data.collection[i].url);
				callback(new Error('Video not found'), null);
			}
		});
	}
}

module.exports = api;