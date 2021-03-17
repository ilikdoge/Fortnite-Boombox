#include <napi.h>
#include <aacdecoder_lib.h>

namespace aac_decoder{
	int frequencyIndex(int f){
		switch(f){
			case 96000: return 0;
			case 88200: return 1;
			case 64000: return 2;
			case 48000: return 3;
			case 44100: return 4;
			case 32000: return 5;
			case 24000: return 6;
			case 22050: return 7;
			case 16000: return 8;
			case 12000: return 9;
			case 11025: return 10;
			case 8000: return 11;
			case 7350: return 12;
			default: return 15;
		}
	}

	void bitwritele(long long& buff, int& byte, int& bit, long long value, int length){
		if(length + bit > 8){
			int remaining = 8 - bit;
			int overflow = length - remaining;
			long v = ((value >> overflow) & ((1 << remaining) - 1)) << (byte << 3);

			buff |= v;
			byte++;
			bit = 0;

			bitwritele(buff, byte, bit, value & ((1 << overflow) - 1), overflow);
		}else{
			long v = (value & ((1 << length) - 1)) << ((byte << 3) + (8 - length - bit));

			buff |= v;
			bit += length;

			if(bit >= 8){
				byte++;
				bit = 0;
			}
		}
	}

	Napi::Number create(const Napi::CallbackInfo& info){
		return Napi::Number::New(info.Env(), (long long)aacDecoder_Open(TT_MP4_RAW, 1));
	}

	void destroy(const Napi::CallbackInfo& info){
		long long instance = info[0].As<Napi::Number>().Int64Value();

		aacDecoder_Close((HANDLE_AACDECODER)instance);
	}

	Napi::Number configure(const Napi::CallbackInfo& info){
		long long instance = info[0].As<Napi::Number>().Int64Value();
		int frequency = info[1].As<Napi::Number>().Int32Value();
		int channels = info[2].As<Napi::Number>().Int32Value();
		int type = AOT_AAC_LC;

		long long config = 0;
		int f = frequencyIndex(frequency);
		int byte = 0;
		int bit = 0;

		bitwritele(config, byte, bit, type, 5);
		bitwritele(config, byte, bit, f, 4);

		if(f == 15)
			bitwritele(config, byte, bit, frequency, 24);
		bitwritele(config, byte, bit, channels, 4);

		unsigned char* c = (unsigned char*)&config;
		unsigned int length = 8;

		AAC_DECODER_ERROR status = aacDecoder_ConfigRaw((HANDLE_AACDECODER)instance, &c, &length);

		return Napi::Number::New(info.Env(), status);
	}

	Napi::Number configure_custom(const Napi::CallbackInfo& info){
		long long instance = info[0].As<Napi::Number>().Int64Value();

		Napi::Uint8Array bytes = info[1].As<Napi::Uint8Array>();

		int type = AOT_AAC_LC;
		unsigned char* c = bytes.Data();
		unsigned int length = bytes.ElementLength();

		AAC_DECODER_ERROR status = aacDecoder_ConfigRaw((HANDLE_AACDECODER)instance, &c, &length);

		return Napi::Number::New(info.Env(), status);
	}

	Napi::Number fill(const Napi::CallbackInfo& info){
		long long instance = info[0].As<Napi::Number>().Int64Value();

		Napi::Uint8Array array = info[1].As<Napi::Uint8Array>();

		unsigned int offset = info[2].As<Napi::Number>().Int32Value();
		unsigned int size = info[3].As<Napi::Number>().Int32Value();

		unsigned char* buffer = array.Data() + offset;

		AAC_DECODER_ERROR status = aacDecoder_Fill((HANDLE_AACDECODER)instance, &buffer, &size, &size);

		return Napi::Number::New(info.Env(), status);
	}

	Napi::Number decode(const Napi::CallbackInfo& info){
		long long instance = info[0].As<Napi::Number>().Int64Value();

		Napi::Float32Array array = info[1].As<Napi::Float32Array>();

		unsigned int length = array.ElementLength();
		short* buffer = new short[length];

		AAC_DECODER_ERROR status = aacDecoder_DecodeFrame((HANDLE_AACDECODER)instance, buffer, length, 0);

		if(status == AAC_DEC_OK){
			float* data = array.Data();

			for(int i = 0; i < length; i++)
				data[i] = (1 / 32768.0f) * buffer[i];
		}

		delete[] buffer;
		return Napi::Number::New(info.Env(), status);
	}

	Napi::Object getInfo(const Napi::CallbackInfo& info){
		Napi::Env env = info.Env();

		long long instance = info[0].As<Napi::Number>().Int64Value();

		CStreamInfo& streamInfo = *aacDecoder_GetStreamInfo((HANDLE_AACDECODER)instance);
		Napi::Object si = Napi::Object::New(env);

		si["sampleRate"] = streamInfo.sampleRate;
		si["frameSize"] = streamInfo.frameSize;
		si["channels"] = streamInfo.numChannels;

		return si;
	}

	Napi::Object init(Napi::Env& env){
		Napi::Object dec = Napi::Object::New(env);

		dec["create"] = Napi::Function::New(env, create);
		dec["destroy"] = Napi::Function::New(env, destroy);
		dec["fill"] = Napi::Function::New(env, fill);
		dec["decode"] = Napi::Function::New(env, decode);
		dec["configure"] = Napi::Function::New(env, configure);
		dec["configure_custom"] = Napi::Function::New(env, configure_custom);
		dec["getInfo"] = Napi::Function::New(env, getInfo);

		return dec;
	}
}