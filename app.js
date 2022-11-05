const Router = require('router')
const { send } = require('micro')
const parse = require('urlencoded-body-parser')
const servePage = require('./pages')
const chatDatabase = require('./_chat')
const { defaultRoomId, defaultName, maxLastMessages } = require('./settings.json')

const router = Router()
const roomSubs = new Map()

router.get('/', (_, res) => {
	res.setHeader('Location', `/${defaultRoomId}/`)
	send(res, 308)
})

const sanitizeString = str => String(str)
	.trim()
	.slice(0, 256)
	.replace(/[^\p{Letter}\p{Mark}\p{Separator}\p{Number}]+/umg, '')

const sanitizeId = id => String(id)
	.trim()
	.slice(0, 128)
	.toLowerCase()
	.replace(/[^a-z0-9-]/ug, '')

router.param('roomId', function (_, res, next, rawId) {
	const roomId = sanitizeId(rawId)
	if (roomId !== rawId) {
		res.setHeader('Location', roomId ? `/${roomId}/` : `/${defaultRoomId}/`)
		return send(res, 307)
	}
	next()
})

router.get('/:roomId', async (req, res) => {
	const { roomId } = req.params
	const isExist = await chatDatabase.exist(roomId)
	sendPage(res, isExist ? 200 : 201, servePage('index', { roomId }))
})

router.get('/:roomId/form', (req, res) => {
	sendPage(res, 200, servePage('form', {
		roomId: req.params.roomId,
		name: defaultName
	}))
})

router.post('/:roomId/form', async (req, res) => {
	const { roomId } = req.params
	const form = await parse(req, { limit: '1kb' })
	const name = sanitizeString(form.name) || defaultName
	sendPage(res, 200, servePage('form', { roomId: req.params.roomId, name }))
	const message = await chatDatabase.send(roomId, name, form.message)
	if (roomSubs.has(roomId)) {
		for (const sub of roomSubs.get(roomId).values()) {
			sub.write(messageToString(...message))
		}
	}
})

router.get('/:roomId/chat', async (req, res) => {
	const { roomId } = req.params
	const { headers, body } = servePage('chat', { roomId })
	const [ header ] = body.split('%MESSAGES%')
	for (const name in headers) {
		res.setHeader(name, headers[name])
	}
	res.setHeader('Transfer-Encoding', 'chunked')
	res.statusCode = 200
	res.write(header)
	// Send last messages
	const messages = await chatDatabase.get(roomId)
	for (const message of messages.slice(-maxLastMessages)) {
		res.write(messageToString(...message))
	}
	// Subscribe for updates
	if (!roomSubs.has(roomId)) {
		roomSubs.set(roomId, new Set())
	}
	const subs = roomSubs.get(roomId)
	subs.add(res)
	res.once('close', () => cleanupSub(roomId, res))
})

router.get('/:roomId/archive', async (req, res) => {
	const { roomId } = req.params
	const { headers, body } = servePage('archive', { roomId })
	const [ header, footer ] = body.split('%MESSAGES%')
	for (const name in headers) {
		res.setHeader(name, headers[name])
	}
	if (await chatDatabase.exist(roomId)) {
		res.statusCode = 200
		res.write(header)
		const messages = await chatDatabase.get(roomId)
		for (const message of messages) {
			res.write(messageToString(...message))
		}
		res.end(footer)
	} else {
		res.statusCode = 404
	}
	res.end()
})

router.get('/.well-known/:roomId', async (req, res) => {
	res.statusCode = 200
	res.end()
})

function cleanupSub (roomId, res) {
	console.log('Disconnected from room', roomId)
	if (!roomSubs.has(roomId)) return
	const subs = roomSubs.get(roomId)
	subs.delete(res)
	if (!subs.size) roomSubs.delete(roomId)
}

function messageToString (ts, name, text) {
	const date = new Date(ts)
	return `<li><span><time datetime="${date.toISOString()}">${date.toLocaleTimeString()}</time> ${name}</span>${text}</li>`
}

function sendPage (res, status, { headers, body }) {
	for (const name in headers) {
		res.setHeader(name, headers[name])
	}
	send(res, status, body)
}

function ErrorHandler(res, err) {
	if (err) {
		console.error(err)
		res.statusCode = 500
	} else {
		res.statusCode = 404
	}
	res.end()
}

module.exports = (req, res) => {
	router(req, res, err => ErrorHandler(res, err))
}