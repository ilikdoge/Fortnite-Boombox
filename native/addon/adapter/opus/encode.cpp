#include <opus.h>
#include <napi.h>

namespace opus_encoder{
	Napi::Value create(const Napi::CallbackInfo& info){
		int frequency = info[0].As<Napi::Number>().Int32Value();
		int channels = info[1].As<Napi::Number>().Int32Value();
		int type = info[2].As<Napi::Number>().Int32Value();
		int quality = info[3].As<Napi::Number>().Int32Value();

		int error = 0;

		OpusEncoder* enc = opus_encoder_create(frequency, channels, type, &error);

		if(error == 0){
			opus_encoder_ctl(enc, OPUS_SET_COMPLEXITY_REQUEST, quality);

			return Napi::Number::New(info.Env(), (long long)enc);
		}

		return info.Env().Null();
	}

	Napi::Value encode(const Napi::CallbackInfo& info){
		long long enc = info[0].As<Napi::Number>().Int64Value();
		int frameSize = info[1].As<Napi::Number>().Int32Value();
		long long max_data_size = info[2].As<Napi::Number>().Int64Value();

		Napi::Float32Array pcm = info[3].As<Napi::Float32Array>();
		Napi::Uint8Array output = info[4].As<Napi::Uint8Array>();

		int err = opus_encode_float((OpusEncoder*)enc, pcm.Data(), frameSize, output.Data(), max_data_size);

		return Napi::Number::New(info.Env(), err);
	}

	void destroy(const Napi::CallbackInfo& info){
		long long enc = info[0].As<Napi::Number>().Int64Value();

		opus_encoder_destroy((OpusEncoder*)enc);
	}

	Napi::Object init(Napi::Env& env){
		Napi::Object enc = Napi::Object::New(env);

		enc["create"] = Napi::Function::New(env, create);
		enc["destroy"] = Napi::Function::New(env, destroy);
		enc["encode"] = Napi::Function::New(env, encode);

		return enc;
	}
}