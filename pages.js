const { minify } = require('html-minifier')
const { readFileSync } = require('fs')
const { randomBytes } = require('crypto')

const HEADERS = {
	'Content-Type': 'text/html; charset=utf-8'
}

const PAGES = {
	archive: './pages/archive.html',
	chat: './pages/chat.html',
	form: './pages/form.html',
	index: './pages/index.html',
}

const NONCE_SIZE = 16

const MINIFY_OPTS = {
	collapseWhitespace: true,
	minifyCSS: true,
	minifyURLs: true,
	removeTagWhitespace: true,
	sortAttributes: true,
}

const {
	name: packageName,
	homepage: packageSource,
	version: packageVersion,
} = require('./package.json')
const { title, description, maxLastMessages } = require('./settings.json')
const templateConstants = {
	title,
	description,
	maxLastMessages,
	packageName,
	packageSource,
	packageVersion,
}

function renderTemplate (string, value, skipUndefined = false) {
	return string.replace(/{(\w+)}/gi, (match, key) => {
		const replace = value[key]
		if (typeof replace === 'string') {
			return renderTemplate(replace, value, skipUndefined)
		}
		return skipUndefined && replace === undefined
			? match
			: replace
	})
}

const preparedPages = {}
for (const name in PAGES) {
	preparedPages[name] = minify(
		renderTemplate(
			readFileSync(PAGES[name], 'utf-8'),
			templateConstants,
			true
		),
		MINIFY_OPTS
	)
}

module.exports = function servePage (page, options) {
	options.nonce = randomBytes(NONCE_SIZE).toString('hex')
	return {
		headers: {
			...HEADERS,
			'Content-Security-Policy': `default-src 'none'; frame-src 'self'; style-src 'nonce-${options.nonce}'`
		},
		body: renderTemplate(preparedPages[page], options)
	}
}
