#include <opus.h>
#include <napi.h>

namespace opus_decoder{
	Napi::Value create(const Napi::CallbackInfo& info){
		int frequency = info[0].As<Napi::Number>().Int32Value();
		int channels = info[1].As<Napi::Number>().Int32Value();

		int error = 0;

		OpusDecoder* dec = opus_decoder_create(frequency, channels, &error);

		if(error == 0)
			return Napi::Number::New(info.Env(), (long long)dec);
		return info.Env().Null();
	}

	Napi::Value decode(const Napi::CallbackInfo& info){
		long long dec = info[0].As<Napi::Number>().Int64Value();

		Napi::Uint8Array packet = info[1].As<Napi::Uint8Array>();

		int offset = info[2].As<Napi::Number>().Int32Value();
		int len = info[3].As<Napi::Number>().Int32Value();
		unsigned char* data = packet.Data() + offset;

		Napi::Float32Array output = info[4].As<Napi::Float32Array>();

		Napi::Object packet_info = info[5].As<Napi::Object>();

		int samples = opus_decoder_get_nb_samples((OpusDecoder*)dec, data, len);
		int channels = opus_packet_get_nb_channels(data);
		int pcm_size = samples * channels;

		packet_info["channel_count"] = channels;
		packet_info["frame_size"] = samples;

		if(samples < 0 || channels < 0)
			return Napi::Number::New(info.Env(), OPUS_INVALID_PACKET);
		int status = opus_decode_float((OpusDecoder*)dec, data, len, output.Data(), samples, 0);

		return Napi::Number::New(info.Env(), status);
	}

	Napi::Object getSampleInfo(const Napi::CallbackInfo& info){
		long long dec = info[0].As<Napi::Number>().Int64Value();

		Napi::Uint8Array packet = info[1].As<Napi::Uint8Array>();

		int offset = info[2].As<Napi::Number>().Int32Value();
		int len = info[3].As<Napi::Number>().Int32Value();
		unsigned char* data = packet.Data() + offset;

		Napi::Object packet_info = Napi::Object::New(info.Env());

		packet_info["channel_count"] = opus_decoder_get_nb_samples((OpusDecoder*)dec, data, len);
		packet_info["frame_size"] = opus_packet_get_nb_channels(data);

		return packet_info;
	}

	void destroy(const Napi::CallbackInfo& info){
		long long dec = info[0].As<Napi::Number>().Int64Value();

		opus_decoder_destroy((OpusDecoder*)dec);
	}

	Napi::Object init(Napi::Env& env){
		Napi::Object dec = Napi::Object::New(env);

		dec["create"] = Napi::Function::New(env, create);
		dec["destroy"] = Napi::Function::New(env, destroy);
		dec["decode"] = Napi::Function::New(env, decode);

		return dec;
	}
}