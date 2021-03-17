'use-strict';

const Resampler = require('../format/resample');
const Channel = require('../format/channel');
const FrameSize = require('../format/framesize');

class Format{
	constructor(input, output, filters){
		this.input_channels = input.channels;
		this.input_rate = input.sample_rate;
		this.output_channels = output.channels;
		this.output_rate = output.sample_rate;
		this.common_channels = Math.min(input.channels, output.channels);
		this.common_rate = Math.min(input.sample_rate, output.sample_rate);
		this.resampling_quality = output.resample_quality || Resampler.QUALITY_SINC_BEST;

		this.resampler = input.sample_rate != output.sample_rate ? new Resampler(this.resampling_quality, this.common_channels, input.sample_rate, output.sample_rate) : null;
		this.channel_mixer = input.channels != output.channels ? new Channel(input.channels, output.channels) : null;
		this.framesize = new FrameSize(output.channels * output.frame_size);
		this.filters = filters;
	}

	process(pcm){
		var output = [];

		if(this.input_channels < this.output_channels){
			if(this.input_rate < this.output_rate){
				pcm = this.handleFilters(pcm);

				if(pcm){
					var error = this.resampler.process(pcm, (buffer, len) => {
						var data = this.framesize.process(this.channel_mixer.process(buffer, len));

						for(var i = 0; i < data.length; i++)
							output.push(data[i]);
					});

					if(error)
						return {error};
				}
			}else if(this.input_rate > this.output_rate){
				var error = this.resampler.process(pcm, (buffer, len) => {
					pcm = this.handleFilters(buffer, len);

					if(pcm){
						var data = this.framesize.process(this.channel_mixer.process(pcm, len));

						for(var i = 0; i < data.length; i++)
							output.push(data[i]);
					}
				});

				if(error)
					return {error};
			}else{
				pcm = this.handleFilters(pcm);

				if(pcm){
					var data = this.framesize.process(this.channel_mixer.process(pcm));

					for(var i = 0; i < data.length; i++)
						output.push(data[i]);
				}
			}
		}else{
			if(this.input_channels > this.output_channels)
				pcm = this.channel_mixer.process(pcm);
			if(this.input_rate < this.output_rate){
				pcm = this.handleFilters(pcm);

				if(pcm){
					var error = this.resampler.process(pcm, (buffer, len) => {
						var data = this.framesize.process(buffer, len);

						for(var i = 0; i < data.length; i++)
							output.push(data[i]);
					});

					if(error)
						return {error};
				}
			}else if(this.input_rate > this.output_rate){
				var error = this.resampler.process(pcm, (buffer, len) => {
					pcm = this.handleFilters(buffer, len);

					if(pcm){
						var data = this.framesize.process(pcm, len);

						for(var i = 0; i < data.length; i++)
							output.push(data[i]);
					}
				});

				if(error)
					return {error};
			}else{
				pcm = this.handleFilters(pcm);

				if(pcm){
					var data = this.framesize.process(pcm);

					for(var i = 0; i < data.length; i++)
						output.push(data[i]);
				}
			}
		}

		return {data: output};
	}

	handleFilters(pcm){
		if(this.filters)
			return this.filters.process(pcm);
		return pcm;
	}

	reset(){
		this.framesize.reset();

		if(this.resampler)
			this.resampler.reset();
	}

	update_input(frequency, channels){
		if(channels != this.input_channels){
			var prevcom = this.common_channels;

			this.input_channels = channels;
			this.common_channels = Math.min(this.input_channels, this.output_channels);

			if(this.input_channels != this.output_channels){
				if(!this.channel_mixer)
					this.channel_mixer = new Channel(this.input_channels, this.output_channels);
				else
					this.channel_mixer.source = this.input_channels;
				if(this.resampler && prevcom != this.common_channels){
					this.resampler.destroy();
					this.resampler = new Resampler(this.resampling_quality, this.common_channels, this.input_rate, this.output_rate);
				}
			}else
				this.channel_mixer = null;
		}

		if(frequency != this.input_rate){
			this.input_rate = frequency;
			this.common_rate = Math.min(this.input_rate, this.output_rate);

			if(this.input_rate != this.output_rate){
				if(!this.resampler)
					this.resampler = new Resampler(this.resampling_quality, this.common_channels, this.input_rate, this.output_rate);
				else{
					this.resampler.reset();
					this.resampler.sourcerate = this.input_rate;
				}
			}else{
				this.resampler.destroy();
				this.resampler = null;
			}
		}
	}

	destroy(){
		if(this.resampler)
			this.resampler.destroy();
	}
}

module.exports = Format;