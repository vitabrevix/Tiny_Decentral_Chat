import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'
import { appendMessage, clearMessages, pushRoom } from '../main.js'

/**
 * All known public y-webrtc signaling servers are currently down.
 * y-webrtc automatically falls back to BroadcastChannel, which
 * syncs between tabs in the same browser — useful for local testing.
 *
 * For cross-device P2P, self-host a signaling server:
 *   npx y-webrtc-server   (starts on ws://localhost:4444)
 * Then add 'ws://localhost:4444' to SIGNALING below.
 *
 * The signaling server only exchanges WebRTC SDP handshakes —
 * it never sees message content.
 */
/**
 * Local signaling server started by: npm run dev:full
 * On GitHub Pages there is no signaling server — Yjs falls back to
 * BroadcastChannel which syncs between tabs in the same browser.
 * To enable cross-device P2P on production, deploy server/yjs-signaling.cjs
 * somewhere and add its wss:// URL here.
 */
const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
const SIGNALING = IS_LOCAL ? ['ws://localhost:4444'] : []

let doc, provider, persistence, messages
let currentRoom   = 'lobby'
let typingTimeout = null

const nickInput   = document.getElementById('yjs-nick')
const msgInput    = document.getElementById('yjs-msg-input')
const sendBtn     = document.getElementById('yjs-send-btn')
const peerStatus  = document.getElementById('yjs-peer-status')
const typingBar   = document.getElementById('yjs-typing')
const awarenessEl = document.getElementById('yjs-awareness-note')

window._yjsCurrentRoom = () => currentRoom

function updateAwareness(typing = false) {
  if (!provider) return
  provider.awareness.setLocalStateField('user', {
    nick: nickInput.value.trim() || 'anon',
    typing,
  })
}

function renderAwareness() {
  if (!provider) return
  const states = Array.from(provider.awareness.getStates().values())
  const others = states.filter(s => s.user?.nick)
  const peers  = Math.max(0, others.length - 1)
  if (peerStatus) peerStatus.textContent = peers > 0
    ? `${peers} peer${peers !== 1 ? 's' : ''} connected`
    : 'local only (BroadcastChannel)'
  if (awarenessEl) awarenessEl.textContent = `awareness: ${others.length} peer${others.length !== 1 ? 's' : ''}`

  const typing = others
    .filter(s => s.user?.typing && s.user?.nick !== (nickInput.value.trim() || 'anon'))
    .map(s => s.user.nick)

  if (typingBar) {
    typingBar.textContent = typing.length === 0 ? '' :
      typing.length === 1 ? `${typing[0]} is typing…` :
      `${typing.slice(0, -1).join(', ')} and ${typing.at(-1)} are typing…`
  }
}

window._yjsJoinRoom = async function joinRoom(room) {
  room = room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'lobby'
  currentRoom = room
  clearMessages('yjs-messages')
  if (peerStatus) peerStatus.textContent = 'connecting…'

  if (provider)    { provider.disconnect(); provider.destroy() }
  if (persistence) { persistence.destroy() }
  if (doc)         { doc.destroy() }

  pushRoom('yjs', room)

  doc      = new Y.Doc()
  messages = doc.getArray('messages')

  persistence = new IndexeddbPersistence(`p2p-chat-yjs:${room}`, doc)
  await new Promise(resolve => persistence.once('synced', resolve))

  messages.toArray().forEach(m => appendMessage('yjs-messages', m))

  appendMessage('yjs-messages', {
    system: true, text: `joined #${room} via yjs + webrtc`, ts: Date.now()
  })

  /**
   * filterBcConns: false → use BroadcastChannel even with 0 signaling servers.
   * This means two tabs in the same browser will sync instantly with no server.
   * Add entries to SIGNALING above to enable cross-device P2P.
   */
  provider = new WebrtcProvider(`p2p-chat:${room}`, doc, {
    signaling: SIGNALING.length > 0 ? SIGNALING : undefined,
    maxConns: 20,
    filterBcConns: false,
  })

  messages.observe(event => {
    event.changes.added.forEach(item => {
      item.content.getContent().forEach(m => {
        if (m?.text && m?.nick) appendMessage('yjs-messages', m)
      })
    })
  })

  provider.awareness.on('change', renderAwareness)
  updateAwareness(false)

  provider.on('peers', ({ webrtcPeers, bcPeers }) => {
    const total = webrtcPeers.length + bcPeers.length
    if (peerStatus) peerStatus.textContent = total > 0
      ? `${webrtcPeers.length} webrtc + ${bcPeers.length} local tab${bcPeers.length !== 1 ? 's' : ''}`
      : 'waiting for peers…'
  })
}

function sendMessage() {
  const text = msgInput.value.trim()
  const nick = nickInput.value.trim() || 'anon'
  if (!text || !doc) return
  doc.transact(() => { messages.push([{ nick, text, ts: Date.now() }]) })
  msgInput.value = ''
  msgInput.style.height = 'auto'
  clearTimeout(typingTimeout)
  updateAwareness(false)
}

sendBtn.addEventListener('click', sendMessage)
msgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
})
msgInput.addEventListener('input', () => {
  msgInput.style.height = 'auto'
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px'
  updateAwareness(true)
  clearTimeout(typingTimeout)
  typingTimeout = setTimeout(() => updateAwareness(false), 2000)
})
nickInput.addEventListener('input', () => updateAwareness(false))

window._yjsJoinRoom('lobby')
