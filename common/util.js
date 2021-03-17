function shorten(str, len = 64){
	if(str.length > len)
		return str.substring(0, len - 1) + '...';
	return str;
};

function unmarkdown(str){
	var chars = ['*', '_', '~', '`'];

	for(var i = 0; i < chars.length; i++)
		str = str.replace(chars[i], '\\' + chars[i]);
	return str;
};

function unembed(str){
	return str.replace(/\[|\]/g, '');
};

function embedlink(name, url){
	return '[' + unembed(unmarkdown(name)) + '](' + url + ')';
};

function subscriptNum(str){
	var diff = '\u2080'.charCodeAt(0) - '0'.charCodeAt(0);
	var ch = [];

	for(var i = 0; i < str.length; i++)
		ch.push(diff + str.charCodeAt(i));
	return String.fromCharCode.apply(null, ch);
};

function timestamp(sec, deci){
	var min = sec / 60;
	var hr = min / 60;
	var sub = null;

	if(deci){
		var d = Math.pow(10, deci);
		var s = Math.round(sec * d) % d;

		if(s > 0){
			sub = s.toString();

			if(sub.length < deci)
				sub = String.fromCharCode(new Array(deci - sub.length).fill('0'.charCodeAt(0))) + sub;
		}
	}

	var days = Math.floor(hr / 24);

	sec = Math.floor(sec) % 60;
	min %= 60;
	hr %= 24;

	var t = [Math.floor(hr), (min < 10 ? '0' : 0) + Math.floor(min), (sec < 10 ? '0': 0) + sec];
	return (days > 0 ? days + 'd ' : '') + (hr >= 1 ? t.join(':') : t.splice(1).join(':')) + (sub ? ' ' + subscriptNum(sub) : '');
};

function parseTimestamp(str){
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

module.exports = {shorten, unmarkdown, unembed, embedlink, subscriptNum, timestamp, parseTimestamp};