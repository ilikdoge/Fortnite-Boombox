'use-strict';

class EventEmitter{
	constructor(){
		this._events = {};
	}

	on(name, cb){
		if(this.destroyed)
			return;
		if(this._events[name])
			this._events[name].push(cb);
		else
			this._events[name] = [cb];
	}

	emit(name, ...args){
		var evt = this._events[name];

		if(evt)
			for(var i = 0; i < evt.length; i++)
				evt[i].apply(this, args);
		else if(evt == 'error')
			throw args[0];
	}
}

module.exports = EventEmitter;