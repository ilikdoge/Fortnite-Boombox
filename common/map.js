'use-strict';

class Map{
	constructor(def = null){
		this._data = {};
		this._size = 0;
		this.def = def;
	}

	get _default(){
		return this.def ? this.def() : null;
	}

	get(key, set = true){
		if(this.has(key))
			return this._data[key];
		else{
			var v = this._default;

			if(set)
				this.set(key, v);
			return v;
		}
	}

	set(key, value){
		if(!this.has(key))
			this._size++;
		var orig = this._data[key];

		this._data[key] = value;

		return orig;
	}

	has(key){
		return key in this._data;
	}

	delete(key){
		if(this.has(key)){
			this._size--;

			delete this._data[key];
		}
	}

	clear(){
		this._data = {};
		this._size = 0;
	}

	get size(){
		return this._size;
	}

	keys(){
		var a = new Array(this._size);
		var index = 0;

		for(var i in data)
			a[index++] = i;
		return a;
	}

	values(){
		var a = new Array(this._size);
		var index = 0;

		for(var i in data)
			a[index++] = data[i];
		return a;
	}
}

module.exports = Map;