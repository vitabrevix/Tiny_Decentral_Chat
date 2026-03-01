/**
 * Local Gun relay server
 * Run with: node server/gun-relay.cjs
 * Listens on http://localhost:8765/gun
 *
 * This is a standard Gun relay — peers discover each other through it
 * but it holds no special authority over the data.
 */
const Gun = require('gun')
const http = require('http')

const PORT = 8765
const server = http.createServer().listen(PORT)
Gun({ web: server })

console.log(`\x1b[31m[gun-relay]\x1b[0m  listening on http://localhost:${PORT}/gun`)
