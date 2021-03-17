# fortnite boombox

old project

## building and running

<code>git clone https://github.com/ilikdoge/Fortnite-Boombox.git</code><br>
<code>cd Fortnite-Boombox</code><br>
<code>git submodule update --init --recursive</code><br>
<code>npm install</code><br>

### running

Set your bot's token in <code>bot_files/config.json</code>

It might be necessary to move the file <code>build/Release/natives.node</code> to <code>build/natives.node</code>
On windows the natives.node may be located elsewhere in the <code>build</code> folder

<code>node index.js</code>