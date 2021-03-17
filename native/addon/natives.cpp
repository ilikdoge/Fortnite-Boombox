#include <napi.h>
#include "adapter/aac/aac-adapter.h"
#include "adapter/opus/opus-adapter.h"
#include "adapter/vorbis/vorbis-adapter.h"
#include "adapter/resample/resample-adapter.h"
#include "util/util.h"

Napi::Object aac_init(Napi::Env& env){
	Napi::Object aac = Napi::Object::New(env);

	aac["decode"] = aac_decoder::init(env);

	return aac;
}

Napi::Object opus_init(Napi::Env& env){
	Napi::Object opus = Napi::Object::New(env);

	opus["encode"] = opus_encoder::init(env);
	opus["decode"] = opus_decoder::init(env);

	return opus;
}

Napi::Object vorbis_init(Napi::Env& env){
	Napi::Object vorbis = Napi::Object::New(env);

	vorbis["decode"] = vorbis_decoder::init(env);

	return vorbis;
}

Napi::Object util_init(Napi::Env& env){
	Napi::Object util = Napi::Object::New(env);

	util["volume"] = volume_init(env);
	util["channel"] = channel_init(env);
	util["copy"] = copy_init(env);

	return util;
}

Napi::Object init(Napi::Env env, Napi::Object exports){
	exports["aac"] = aac_init(env);
	exports["opus"] = opus_init(env);
	exports["vorbis"] = vorbis_init(env);
	exports["resample"] = resample::init(env);
	exports["util"] = util_init(env);

	return exports;
}

NODE_API_MODULE(addon, init)