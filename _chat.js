const fs = require('fs')

const escapeMap = new Map([
	[/\&/g, '&amp'],
	[/\</g, '&lt'],
	[/\>/g, '&gt'],
	[/\"/g, '&quot'],
	[/\'/g, '&#39'],
	[/\//g, '&#x2F'],
	[/\n+/g, '<br/>'],
	[/\r+/g, ''],
	[/\t+/g, '']
])

function escapeHtml (str) {
	str = str.trim()
	for (const [regex, replace] of escapeMap.entries()) {
		if (!regex.test(str)) continue
		str = str.replaceAll(regex, replace)
	}
	return str
}

const Chat = {
	_data: {},
	_filename: 'chats.json',

	exist (id) {
		return id in this._data
	},
	get (id) {
		return this._data[id] || []
	},
	send (id, nick, msg) {
		if (!nick || !msg) return
		const entry = [Date.now(), escapeHtml(nick), escapeHtml(msg)]
		this._data[id] = this._data[id] || []
		this._data[id].push(entry)
		return entry
	},
	cleanup (id) {
		if (!id) return Object.keys(this._data).forEach(cleanup)
		const chat = this.get(id)
		const filter = ([ts]) => (Date.now() - ts) < 1.8e7
		if (!filter(chat[chat.length-1])) {
			delete this._data[id]
		} else {
			this._data[id] = chat.filter(filter)
		}
	},
	async save () {
		fs.writeFileSync(this._filename, JSON.stringify(this._data))
	},
	async load () {
		if (!fs.existsSync(this._filename)){
			return this.save()
		}
		this._data = JSON.parse(fs.readFileSync(this._filename))
	}
}

Chat.load()
	.then(() => console.log('Loaded chats!'))
	.catch(e => console.error('Failed to load chats:', e))
setInterval(() => Chat.save()
	.then(() => console.log('Chats autosaved!'))
	.catch(e => console.error('Failed to autosave chats:', e)), 1e5)

module.exports = Chat
