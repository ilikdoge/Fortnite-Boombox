#include <napi.h>

double max(double a, double b){
	return a > b ? a : b;
}

double min(double a, double b){
	return a < b ? a : b;
}

long long min(long long a, long long b){
	return a < b ? a : b;
}

void volume(const Napi::CallbackInfo& info){
	Napi::Float32Array pcm = info[0].As<Napi::Float32Array>();

	float* data = pcm.Data();

	double gain = info[1].As<Napi::Number>().DoubleValue();
	long long len = info[2].As<Napi::Number>().Int64Value();

	for(int i = 0; i < len; i++)
		data[i] = (float)max(-1, min(1, data[i] * gain));
}

Napi::Float32Array channel(const Napi::CallbackInfo& info){
	Napi::Float32Array pcm = info[0].As<Napi::Float32Array>();

	float* pcmdata = pcm.Data();

	long long len = info[1].As<Napi::Number>().Int64Value();
	int source = info[2].As<Napi::Number>().Int32Value();
	int target = info[3].As<Napi::Number>().Int32Value();
	int in_frames = len / source;

	Napi::Float32Array out = Napi::Float32Array::New(info.Env(), in_frames * target);

	float* outdata = out.Data();

	for(int i = 0; i < in_frames; i++){
		int inoff = i * source;
		int outoff = i * target;

		for(int j = 0; j < target; j++)
			outdata[outoff + j] = pcmdata[inoff + j % source];
	}

	return out;
}

Napi::Number copy(const Napi::CallbackInfo& info){
	Napi::Float32Array source = info[0].As<Napi::Float32Array>();
	Napi::Float32Array target = info[1].As<Napi::Float32Array>();

	long long sourceoffset = info[2].As<Napi::Number>().Int64Value();
	long long targetoffset = info[3].As<Napi::Number>().Int64Value();
	long long sourcelen = info[4].As<Napi::Number>().Int64Value();
	long long targetlen = info[5].As<Napi::Number>().Int64Value();

	float* sourcedata = source.Data() + sourceoffset;
	float* targetdata = target.Data() + targetoffset;

	long long copy = min(sourcelen - sourceoffset, targetlen - targetoffset);

	memcpy(targetdata, sourcedata, copy * 4);

	return Napi::Number::New(info.Env(), copy);
}

Napi::Function volume_init(Napi::Env& env){
	return Napi::Function::New(env, volume);
}

Napi::Function channel_init(Napi::Env& env){
	return Napi::Function::New(env, channel);
}

Napi::Function copy_init(Napi::Env& env){
	return Napi::Function::New(env, copy);
}