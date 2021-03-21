# fortnite boombox

old project

## building and running

### prerequisites

```
Node.js
CMake

Windows: msvc
Linux: clang or gcc
```

```sh
git clone https://github.com/ilikdoge/Fortnite-Boombox.git
cd Fortnite-Boombox
git submodule update --init --recursive
npm install
```

### Note

On windows it is necessary to put
```c
#define _USE_MATH_DEFINES
```

at the very beginning of the file located at `native/vorbis/test/util.c`

### running

Set your bot's token in <code>bot_files/config.json</code>

It might be necessary to move the file <code>build/Release/natives.node</code> to <code>build/natives.node</code><br>
On windows the natives.node may be located elsewhere in the <code>build</code> folder

<code>node index.js</code>