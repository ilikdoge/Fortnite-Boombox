#include <napi.h>
#include <samplerate.h>
#include <iostream>
#include <ctime>

namespace resample{
	Napi::Value create(const Napi::CallbackInfo& info){
		int type = info[0].As<Napi::Number>().Int32Value();
		int channels = info[1].As<Napi::Number>().Int32Value();
		int error = 0;

		SRC_STATE* state = src_new(type, channels, &error);

		if(error == 0)
			return Napi::Number::New(info.Env(), (long long)state);
		return info.Env().Null();
	}

	void destroy(const Napi::CallbackInfo& info){
		long long state = info[0].As<Napi::Number>().Int64Value();

		src_delete((SRC_STATE*)state);
	}

	void reset(const Napi::CallbackInfo& info){
		long long state = info[0].As<Napi::Number>().Int64Value();

		src_reset((SRC_STATE*)state);
	}

	Napi::Value convert(const Napi::CallbackInfo& info){
		long long state = info[0].As<Napi::Number>().Int64Value();

		Napi::Float32Array in = info[1].As<Napi::Float32Array>();

		int inoffset = info[2].As<Napi::Number>().Int32Value();
		long long inlen = in.ElementLength();

		Napi::Float32Array out = info[3].As<Napi::Float32Array>();

		int outoffset = info[4].As<Napi::Number>().Int32Value();
		long long outlen = out.ElementLength();
		float* outdata = out.Data() + outoffset;

		int sourcerate = info[5].As<Napi::Number>().Int32Value();
		int endrate = info[6].As<Napi::Number>().Int32Value();
		int channels = src_get_channels((SRC_STATE*)state);

		SRC_DATA data;

		data.data_in = in.Data() + inoffset;
		data.data_out = outdata;
		data.input_frames = (inlen - inoffset) / channels;
		data.output_frames = (outlen - outoffset) / channels;
		data.input_frames_used = 0;
		data.output_frames_gen = 0;
		data.src_ratio = (double)endrate / sourcerate;
		data.end_of_input = 0;

		int status = src_process((SRC_STATE*)state, &data);

		Napi::Object offset = Napi::Object::New(info.Env());

		offset["status"] = status;
		offset["input"] = Napi::Number::New(info.Env(), data.input_frames_used * channels);
		offset["output"] = Napi::Number::New(info.Env(), data.output_frames_gen * channels);

		return offset;
	}

	Napi::Object init(Napi::Env& env){
		Napi::Object res = Napi::Object::New(env);

		res["create"] = Napi::Function::New(env, create);
		res["destroy"] = Napi::Function::New(env, destroy);
		res["reset"] = Napi::Function::New(env, reset);
		res["convert"] = Napi::Function::New(env, convert);

		return res;
	}
}