const util = require('./util');

const SHORT_TIMEOUT = 8000;
const MEDIUM_TIMEOUT = 16000;
const LONG_TIMEOUT = 32000;
const LONGEST_TIMEOUT = 64000;

const command = {
	invalid(suggestion){
		return {content: 'Not a valid parameter. Did you mean `' + suggestion + '`?', timeout: SHORT_TIMEOUT};
	}, undefined(){
		return {content: 'Not a command', timeout: SHORT_TIMEOUT};
	}, dev(){
		return {content: 'Only devs may use this command tree', timeout: SHORT_TIMEOUT};
	}, available(pref, paramList){
		var l = [];
		var r = [];

		for(var i = 0; i < paramList.length; i++)
			if(i % 2 == 0)
				l.push(pref + ' ' + paramList[i]);
			else
				r.push(pref + ' ' + paramList[i]);
		return {embed: {
			title: 'It looks like you are missing some parameters.\nTry the following commands:',
			fields: [{
				name: '_ _',
				value: l.join('\n'),
				inline: true
			}, {
				name: '_ _',
				value: r.join('\n'),
				inline: true
			}]}, timeout: MEDIUM_TIMEOUT};
	}
};

const error = {
	module(mod, error){
		return {content: mod + ' module returned error `' + error + '`', timeout: SHORT_TIMEOUT};
	}, connect(){
		return {content: 'Failed to join channel', timeout: SHORT_TIMEOUT}
	}
};

const media = {
	preview(item){
		return {embed: {
			author: {
				name: item.publisher.name,
				icon_url: item.publisher.icon
			}, title: 'Now playing',
			description: util.embedlink(item.media.title || 'Audio File', item.sourceurl || item.url),
			thumbnail: {
				url: item.media.thumbnail
			}
		}, timeout: SHORT_TIMEOUT};
	}, playing(item){
		var msg = this.preview(item);

		if(item.duration.seconds)
			msg.embed.title += ' [' + item.duration.timestamp + ']';
		return msg;
	}, error(item, error){
		var msg = this.preview(item);

		msg.embed.title = 'Error Playing';
		msg.embed.description += '\n\n' + error.message;

		return msg;
	}, added(item, noattach){
		var msg = this.preview(item);

		msg.embed.title = 'Added an item to your queue';

		if(noattach)
			msg.embed.description += '\n\nYour queue is not attached.\nTo begin playing from it, please attach your queue';

		return msg;
	}
};

const search = {
	base(message, pre, post, source, query){
		return {
			title: pre + ' ' + source + ' for `' + query + '`' + post
		}
	}, fetching(message, source, query){
		return this.base(message, 'Searching', '...', source, query);
	}, finished(message, source, query, results){
		var embed = this.base(message, 'Searched', '.', source, query);

		if(results > 0)
			embed.fields = [{name: 'Found ' + results + ' results', value: 'Type `cancel` to cancel'}];
		else
			embed.fields = [{name: 'No results found', value: 'Try searching for something else'}];
		return embed;
	}, result(item, index){
		return {
			author: {
				name: item.publisher.name,
				icon_url: item.publisher.icon
			}, title: item.media.title,
			description: 'Select this by typing ' + index,
			thumbnail: {url: item.media.thumbnail}
		};
	}
};

const playlist = {
	fetching(message){
		return {
			title: 'Queueing playlist...',
			description: 'This may take several seconds',
			footer: {
				text: message.member.displayName,
				icon_url: message.author.displayAvatarURL()
			}
		}
	}, finished(message, results){
		if(!results)
			return {
				title: results === 0 ? 'Playlist has no playable videos' : 'Playlist not found',
				description: 'Added 0 items',
				footer: {
					text: message.member.displayName,
					icon_url: message.author.displayAvatarURL()
				}
			}
		return {
			title: 'Queued playlist',
			description: 'Added ' + results + ' item(s)',
			footer: {
				text: message.member.displayName,
				icon_url: message.author.displayAvatarURL()
			}
		}
	}, removed(){
		return {content: 'Playlist removed from queue', timeout: SHORT_TIMEOUT};
	}, shuffle_prompt(){
		return 'Shuffle playlist? Type `yes` or `no` to leave it as is.\nType `cancel` to cancel queueing';
	}
};

const queue = {
	detached(){
		return {content: 'Queue detached', timeout: SHORT_TIMEOUT};
	}, already_detached(){
		return {content: 'Nothing to detach', timeout: SHORT_TIMEOUT};
	}, cannot_attach(){
		return {content: 'Nothing to attach', timeout: SHORT_TIMEOUT};
	}, attached(){
		return {content: 'Queue attached', timeout: SHORT_TIMEOUT};
	}, already_attached(){
		return {content: 'Queue already attached', timeout: SHORT_TIMEOUT};
	}, user_queue_empty(){
		return {content: 'Your queue is empty', timeout: SHORT_TIMEOUT};
	}, duration(durs, unknown){
		return 'Total duration: ' + durs.join(' - ') + (unknown > 0 ? ' excluding ' + unknown + ' items with unknown duration' : '');
	}, user_queue_list(owner, content, range, dur){
		return {embed: {
			author: {name: owner.name, icon_url: owner.icon},
			title: range.all ? 'Showing all media in your queue' : 'Showing ' + range.begin + '-' + range.end + ' of ' + range.length + ' items in your queue',
			fields: [{
				name: 'Name',
				value: content.titles.join('\n'),
				inline: true
			}, {
				name: 'Details',
				value: content.details.join('\n'),
				inline: true
			}], footer: {text: this.duration(dur.duration, dur.unknown)}
		}, timeout: MEDIUM_TIMEOUT};
	}, list(guild, content, range, dur){
		return {embed: {
			author: {name: guild.name, icon_url: guild.icon},
			title: range.all ? 'Showing all queue items' : 'Showing ' + range.begin + '-' + range.end + ' of ' + range.length + ' queued items',
			fields: [{
				name: 'User',
				value: content.users.join('\n'),
				inline: true
			}, {
				name: 'Details',
				value: content.titles.join('\n'),
				inline: true
			}, {
				name: '_ _',
				value: content.durations.join('\n'),
				inline: true
			}], footer: {text: this.duration(dur.duration, dur.unknown)}
		}, timeout: MEDIUM_TIMEOUT};
	}, global_queue_empty(){
		return {content: 'No media in queue', timeout: SHORT_TIMEOUT};
	}, deleted(count){
		return {content: 'Deleted ' + count + ' item(s)', timeout: SHORT_TIMEOUT};
	}, cleared(){
		return {content: 'Queue cleared', timeout: SHORT_TIMEOUT};
	}, moved(count, pos){
		return {content: 'Moved ' + count + ' item(s) to position ' + pos, timeout: SHORT_TIMEOUT};
	}, shuffled(count){
		return {content: 'Shuffled ' + count + ' item(s)', timeout: SHORT_TIMEOUT};
	}, missing_position(max){
		return {content: 'Enter a valid number for the new position from 1 to ' + max, timeout: SHORT_TIMEOUT};
	}
};

const missing = {
	permissions(){
		return {content: 'Missing permissions', timeout: SHORT_TIMEOUT};
	}, voice_channel(){
		return {content: 'Require voice channel', timeout: SHORT_TIMEOUT};
	}, playing(){
		return {content: 'Nothing is playing', timeout: SHORT_TIMEOUT};
	}
};

const parameter = {
	number(min, max){
		return {content: 'Enter a valid number between ' + min + ' and ' + max, timeout: SHORT_TIMEOUT, cleanup: true};
	}, range_parameter(num, min, max){
		return {content: 'Enter a valid number for parameter ' + num + ' from ' + min + ' to ' + max, timeout: SHORT_TIMEOUT, cleanup: true};
	}, timestamp(){
		return {content: 'Enter a valid timestamp (hh?:mm?:ss)', timeout: SHORT_TIMEOUT, cleanup: true};
	}, timerange(){
		return {content: 'Time out of bounds', timeout: SHORT_TIMEOUT};
	}, range(){
		return {content: 'Enter a valid range', timeout: SHORT_TIMEOUT};
	}, missing(){
		return {content: 'Provide a parameter', timeout: SHORT_TIMEOUT};
	}
};

const controls = {
	seek: {
		unsupported(){
			return {content: 'This media does not support seeking', timeout: SHORT_TIMEOUT};
		}, ask(){
			return {content: 'Ask the user who queued this to seek it', timeout: SHORT_TIMEOUT};
		}, error(err){
			return {content: 'Seeking failed due to error `' + err + '`', timeout: SHORT_TIMEOUT};
		}
	}, volume: {
		unsupported: function(){
			return {content: 'This media does not support volume changing', timeout: 8000};
		}, ask: function(){
			return {content: 'Ask the user who queued this to change it', timeout: 8000};
		}, outofrange: function(low, high){
			return {content: 'Volume must be between ' + low + ' and ' + high, timeout: 8000};
		}
	}, bitrate: {
		unsupported: function(){
			return {content: 'This media does not support bitrate changing', timeout: 8000};
		}, ask: function(){
			return {content: 'Ask the user who queued this to change it', timeout: 8000};
		}, outofrange: function(low, high){
			return {content: 'Bitrate must be between ' + low + ' and ' + high, timeout: 8000};
		}
	}, speed: {
		unsupported(){
			return {content: 'This media does not support changing speed', timeout: SHORT_TIMEOUT};
		}, ask: function(){
			return {content: 'Ask the user who queued this to change it', timeout: 8000};
		}, outofrange: function(low, high){
			return {content: 'Speed must be atleast ' + low + ' and at most ' + high, timeout: 8000};
		}
	}
};

const settings = {
	none_set(){
		return {content: 'No server settings set', timeout: SHORT_TIMEOUT};
	}, list(name, value){
		return {embed: {
			title: 'Server settings',
			fields: [{
				name: 'Name',
				value: name.join('\n'),
				inline: true
			}, {
				name: 'Value',
				value: value.join('\n'),
				inline: true
			}]
		}, timeout: MEDIUM_TIMEOUT};
	}, boolean(){
		return {content: 'Parameter must be one of TRUE or FALSE', timeout: SHORT_TIMEOUT};
	}, timestamp(){
		return {content: 'Enter a valid timestamp in the form hh?:mm?:ss', timeout: SHORT_TIMEOUT};
	}, changed(name){
		return {content: 'Changed setting ' + name, timeout: SHORT_TIMEOUT};
	}
};

const help = {
	base(prefix){
		return {embed: {
			title: 'General command list',
			fields: [{
				name: '**__Play commands__**',
				value: '_ _'
			}, {
				name: 'Play media',
				value: prefix + ' play *[args]*'
			}, {
				name: 'Play from a specified source',
				value: prefix + ' play *[yt|sc|ig|tw]* *[args]*'
			}, {
				name: '**__Media controls commands__**',
				value: '_ _'
			}, {
				name: 'Skip current media or vote to skip (if in queue)',
				value: prefix + ' skip'
			}, {
				name: 'Empty your queue and give away your aux cord (if you have it)',
				value: prefix + ' stop'
			}, {
				name: 'Seek the playing media',
				value: prefix + ' seek *[timestamp]*'
			}, {
				name: 'See whats playing',
				value: prefix + ' playing'
			}, {
				name: '**__Queue commands__**',
				value: '_ _'
			}, {
				name: 'Attach or detach your queue from the bot\'s cycle',
				value: prefix + ' queue *[attach, detach]*'
			}, {
				name: 'Modify your queue',
				value: prefix + ' queue *[delete, move]*'
			}, {
				name: 'View queue',
				value: prefix + ' queue *[view, list]* *[pageNumber]*'
			}, {
				name: '**__Bind commands__**',
				value: '_ _'
			}, {
				name: 'Bind currently playing to a name',
				value: prefix + ' binds create current *[name]*'
			}, {
				name: 'Create a custom bind',
				value: prefix + ' binds create *[yt, sc, ig]* *[name]*'
			}, {
				name: 'Play from one of your binds',
				value: prefix + ' play bind *[name]*'
			}, {
				name: 'List your binds',
				value: prefix + ' binds list *[pageNumber]*'
			}, {
				name: 'Delete a bind',
				value: prefix + ' binds delete *[name]*'
			}, {
				name: '**__Other commands__**',
				value: '_ _',
			}, {
				name: 'Change server settings (as owner)',
				value: prefix + ' settings\nRefer to `' + prefix + ' help settings`'
			}, {
				name: 'Help',
				value: prefix + ' help *[commandName]*\n(e.g ' + prefix + ' help `help`)'
			}]
		}, timeout: LONG_TIMEOUT};
	}, description(path, desc){
		var embed = {
			title: 'Help for command ' + path,
			fields: [{
				name: 'Description',
				value: desc.details.join('\n')
			}]
		};

		if(desc.examples)
			embed.fields.push({name: 'Examples', value: path + ' ' + desc.examples.join('\n' + path + ' ')});
		if(desc.syntax)
			embed.fields.push({name: 'Syntax', value: path + ' [' + desc.syntax.join('] [') + ']'});
		return {embed: embed, timeout: MEDIUM_TIMEOUT};
	}, correction(corr, avail){
		var l = [];
		var r = [];

		for(var i = 0; i < avail.length; i++)
			if(i % 2 == 0)
				l.push(avail[i]);
			else
				r.push(avail[i]);
		return {embed: {
			title: (corr ? 'Did you mean `' + corr + '`?' : 'It looks like you are missing some parameters.') + '\nTry the following:',
			fields: [{
				name: '_ _',
				value: l.join('\n'),
				inline: true
			}, {
				name: '_ _',
				value: r.join('\n'),
				inline: true
			}]}, timeout: MEDIUM_TIMEOUT};
	}
};

module.exports = {
	command, error, media, search, playlist, queue,
	missing, parameter, controls, settings, help,

	invite(username, id){
		return {embed: {description: 'Invite ' + username + ' by clicking [here](https://discordapp.com/oauth2/authorize?scope=bot&permissions=3164160&client_id=' + id + ')'}, timeout: SHORT_TIMEOUT};
	},

	SHORT_TIMEOUT, MEDIUM_TIMEOUT, LONG_TIMEOUT, LONGEST_TIMEOUT
}