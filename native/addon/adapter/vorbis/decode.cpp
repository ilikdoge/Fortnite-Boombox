#include <napi.h>
#include <vorbis/codec.h>

namespace vorbis_decoder{
	typedef struct{
		vorbis_info info;
		vorbis_dsp_state dsp;
	} vorbis_state;

	Napi::Number create(const Napi::CallbackInfo& info){
		vorbis_state* s = new vorbis_state();

		vorbis_info_init(&s -> info);

		return Napi::Number::New(info.Env(), (long long)s);
	}

	Napi::Number configure(const Napi::CallbackInfo& info){
		long long state = info[0].As<Napi::Number>().Int64Value();

		vorbis_state* s = (vorbis_state*)state;

		Napi::Uint8Array header = info[1].As<Napi::Uint8Array>();

		unsigned char* data = header.Data();

		if(data[0] != 2)
			return Napi::Number::New(info.Env(), OV_EBADHEADER);
		int offset = 1;

		int first_size = 0;
		int second_size = 0;

		while(true){
			int v = data[offset++];

			first_size += v;

			if(v < 255)
				break;
		}

		while(true){
			int v = data[offset++];

			second_size += v;

			if(v < 255)
				break;
		}

		ogg_packet packet;

		packet.packet = header.Data() + offset;
		packet.bytes = first_size;
		packet.b_o_s = 1;
		packet.e_o_s = 0;
		packet.granulepos = 0;
		packet.packetno = 0;

		vorbis_comment comment;

		comment.vendor = "";

		int error = vorbis_synthesis_headerin(&s -> info, &comment, &packet);

		if(error != 0)
			return Napi::Number::New(info.Env(), error);
		packet.packet = header.Data() + offset + first_size + second_size;
		packet.bytes = header.ElementLength() - offset - first_size - second_size;
		packet.b_o_s = 0;
		packet.e_o_s = 0;
		packet.granulepos = 0;
		packet.packetno = 0;

		error = vorbis_synthesis_headerin(&s -> info, &comment, &packet);

		if(error != 0)
			return Napi::Number::New(info.Env(), error);
		error = vorbis_synthesis_init(&s -> dsp, &s -> info);

		return Napi::Number::New(info.Env(), error);
	}

	Napi::Object getInfo(const Napi::CallbackInfo& info){
		long long state = info[0].As<Napi::Number>().Int64Value();

		vorbis_state* s = (vorbis_state*)state;

		Napi::Object inf = Napi::Object::New(info.Env());

		inf["channels"] = s -> info.channels;
		inf["sampleRate"] = s -> info.rate;

		return inf;
	}

	Napi::Number decode(const Napi::CallbackInfo& info){
		long long state = info[0].As<Napi::Number>().Int64Value();

		vorbis_state* s = (vorbis_state*)state;

		Napi::Uint8Array input = info[1].As<Napi::Uint8Array>();

		int offset = info[2].As<Napi::Number>().Int32Value();
		int length = info[3].As<Napi::Number>().Int32Value();

		Napi::Float32Array output = info[4].As<Napi::Float32Array>();

		ogg_packet packet;

		packet.packet = input.Data() + offset;
		packet.bytes = length;
		packet.b_o_s = 0;
		packet.e_o_s = 0;
		packet.granulepos = 0;
		packet.packetno = 0;

		vorbis_block block;

		vorbis_block_init(&s -> dsp, &block);

		int error = vorbis_synthesis(&block, &packet);

		if(error != 0){
			vorbis_block_clear(&block);

			return Napi::Number::New(info.Env(), error);
		}

		vorbis_synthesis_blockin(&s -> dsp, &block);
		vorbis_block_clear(&block);

		int avail = vorbis_synthesis_pcmout(&s -> dsp, nullptr);
		int channels = s -> info.channels;
		float** pcm;

		vorbis_synthesis_pcmout(&s -> dsp, &pcm);
		vorbis_synthesis_read(&s -> dsp, avail);

		float* p = output.Data();

		offset = 0;

		for(int i = 0; i < avail; i++)
			for(int j = 0; j < channels; j++)
				p[offset++] = pcm[j][i];
		return Napi::Number::New(info.Env(), avail);
	}

	void destroy(const Napi::CallbackInfo& info){
		long long state = info[0].As<Napi::Number>().Int64Value();

		vorbis_state* s = (vorbis_state*)state;

		vorbis_dsp_clear(&s -> dsp);
		vorbis_info_clear(&s -> info);

		delete s;
	}

	Napi::Object init(Napi::Env& env){
		Napi::Object dec = Napi::Object::New(env);

		dec["create"] = Napi::Function::New(env, create);
		dec["configure"] = Napi::Function::New(env, configure);
		dec["decode"] = Napi::Function::New(env, decode);
		dec["destroy"] = Napi::Function::New(env, destroy);
		dec["getInfo"] = Napi::Function::New(env, getInfo);

		return dec;
	}
}