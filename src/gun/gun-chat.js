import Gun from 'gun'
import 'gun/sea.js'
import { appendMessage, clearMessages, pushRoom } from '../main.js'

/**
 * Gun peers: try a few known-live community relays.
 * If all fail, Gun still works locally (localStorage) and
 * will sync between tabs via BroadcastChannel automatically.
 * For production, self-host a relay:
 *   npx gun-relay   (starts on http://localhost:8765/gun)
 */
/**
 * Local relay started by: npm run dev:full
 * On GitHub Pages there is no relay — Gun syncs between same-browser
 * tabs via its internal BroadcastChannel mechanism (no server needed).
 */
const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
const PEERS = IS_LOCAL ? ['http://localhost:8765/gun'] : []

let gun         = Gun({ peers: PEERS, localStorage: true })
let currentRoom = 'lobby'
let seenIds     = new Set()
let unsubscribe = null

// DOM refs — safe to query here because dynamic import ensures
// this module runs after the full DOM is ready
const nickInput  = document.getElementById('gun-nick')
const msgInput   = document.getElementById('gun-msg-input')
const sendBtn    = document.getElementById('gun-send-btn')

// peerStatus lives in the status bar — always present
const peerStatus = document.getElementById('gun-peer-status')

window._gunCurrentRoom = () => currentRoom

window._gunJoinRoom = function joinRoom(room) {
  room = room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'lobby'
  currentRoom = room
  seenIds = new Set()
  clearMessages('gun-messages')
  if (unsubscribe) { unsubscribe(); unsubscribe = null }

  pushRoom('gun', room)

  appendMessage('gun-messages', {
    system: true, text: `joined #${room} via gun.js`, ts: Date.now()
  })

  const ref = gun.get('chat').get(room).map().on((data, soul) => {
    if (!data || seenIds.has(soul)) return
    if (!data.text || !data.nick) return
    seenIds.add(soul)
    appendMessage('gun-messages', { nick: data.nick, text: data.text, ts: data.ts || Date.now() })
  })

  unsubscribe = () => ref.off()
}

function sendMessage() {
  const text = msgInput.value.trim()
  const nick = nickInput.value.trim() || 'anon'
  if (!text) return
  gun.get('chat').get(currentRoom).set({ nick, text, ts: Date.now() })
  msgInput.value = ''
  msgInput.style.height = 'auto'
}

function checkPeerStatus() {
  if (!peerStatus) return
  try {
    const mesh      = gun.back('opt.mesh')
    const wireCount = mesh ? Object.keys(mesh.wire || {}).length : 0
    peerStatus.textContent = wireCount > 0
      ? `${wireCount} peer${wireCount !== 1 ? 's' : ''} connected`
      : 'local only (no relay)'
  } catch {
    peerStatus.textContent = 'local only'
  }
}

setInterval(checkPeerStatus, 3000)

sendBtn.addEventListener('click', sendMessage)
msgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
})
msgInput.addEventListener('input', () => {
  msgInput.style.height = 'auto'
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px'
})

window._gunJoinRoom('lobby')
if (peerStatus) peerStatus.textContent = 'connecting…'
setTimeout(checkPeerStatus, 3000)
