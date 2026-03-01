/**
 * Local Yjs WebRTC signaling server
 * Run with: node server/yjs-signaling.cjs
 * Listens on ws://localhost:4444
 *
 * This server ONLY exchanges WebRTC SDP handshakes between peers.
 * It never sees, stores, or touches message content.
 * Once two peers connect via WebRTC, this server plays no further role.
 *
 * Based on the official y-webrtc-server implementation.
 */
const http = require('http')
const WebSocket = require('ws')

const PORT = 4444
const server = http.createServer()
const wss    = new WebSocket.Server({ server })

// topic → Set<WebSocket>
const topics = new Map()

function send(conn, msg) {
  if (conn.readyState === WebSocket.OPEN) {
    conn.send(JSON.stringify(msg))
  }
}

wss.on('connection', ws => {
  const subscribedTopics = new Set()
  let closed = false

  ws.on('message', raw => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    if (msg.type === 'subscribe') {
      (msg.topics || []).forEach(topic => {
        if (!topics.has(topic)) topics.set(topic, new Set())
        topics.get(topic).add(ws)
        subscribedTopics.add(topic)
      })
    }

    if (msg.type === 'unsubscribe') {
      (msg.topics || []).forEach(topic => {
        topics.get(topic)?.delete(ws)
        subscribedTopics.delete(topic)
      })
    }

    if (msg.type === 'publish') {
      const receivers = topics.get(msg.topic)
      if (receivers) {
        receivers.forEach(receiver => {
          if (receiver !== ws) send(receiver, msg)
        })
      }
    }

    if (msg.type === 'ping') {
      send(ws, { type: 'pong' })
    }
  })

  ws.on('close', () => {
    closed = true
    subscribedTopics.forEach(topic => {
      topics.get(topic)?.delete(ws)
    })
  })
})

server.listen(PORT, () => {
  console.log(`\x1b[32m[yjs-signal]\x1b[0m listening on ws://localhost:${PORT}`)
})
