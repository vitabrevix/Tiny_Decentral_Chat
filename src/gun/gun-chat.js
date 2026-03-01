/**
 * Gun.js Chat
 * ─────────────────────────────────────────────────────────────────
 * How it works:
 *   - Gun stores messages as nodes in a graph: chat/<room>/<msgId>
 *   - Each node has: nick, text, ts
 *   - gun.get('chat').get(room).map().on(...) subscribes to all
 *     child nodes and fires whenever any peer adds/updates one
 *   - Persistence: Gun writes to localStorage via its Radisk adapter
 *   - P2P: Gun connects to public relay peers via WebSocket; from
 *     there peers negotiate WebRTC connections for direct sync
 *
 * With HAM (Hypothetical Amnesia Machine):
 *   - If two peers write the same field simultaneously while offline,
 *     the peer with the "heavier" machine state wins deterministically
 *   - Every peer independently arrives at the same result — no server vote
 */

import Gun from 'gun'
import 'gun/sea.js'

import { appendMessage, clearMessages } from '../main.js'

// ── Public Gun relay peers (anyone can run these) ─────────────
const PEERS = [
  'https://gun-manhattan.herokuapp.com/gun',
  'https://gun-us.herokuapp.com/gun',
]

let gun = Gun({ peers: PEERS, localStorage: true })
let currentRoom = 'lobby'
let seenIds = new Set()
let unsubscribe = null

// ── DOM refs ──────────────────────────────────────────────────
const roomInput   = document.getElementById('gun-room-input')
const joinBtn     = document.getElementById('gun-join-btn')
const nickInput   = document.getElementById('gun-nick')
const msgInput    = document.getElementById('gun-msg-input')
const sendBtn     = document.getElementById('gun-send-btn')
const roomLabel   = document.getElementById('gun-room-label')
const peerStatus  = document.getElementById('gun-peer-status')

// ── Join / subscribe to a room ────────────────────────────────
function joinRoom(room) {
  room = room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'lobby'
  currentRoom = room
  seenIds = new Set()
  roomLabel.textContent = `#${room}`
  clearMessages('gun-messages')

  // Unsubscribe from old room
  if (unsubscribe) { unsubscribe(); unsubscribe = null }

  appendMessage('gun-messages', {
    system: true,
    text: `joined #${room} via gun.js`,
    ts: Date.now()
  })

  /**
   * gun.get('chat').get(room) → navigate to the room node
   * .map() → iterate over all child nodes (each is a message)
   * .on() → subscribe: fires immediately for existing data,
   *          then again whenever any peer pushes an update
   *
   * Gun de-duplicates by soul (unique node ID), but .on() can
   * fire multiple times for the same soul as peers sync.
   * We use seenIds to deduplicate on our end.
   */
  const ref = gun.get('chat').get(room).map().on((data, soul) => {
    if (!data || seenIds.has(soul)) return
    if (!data.text || !data.nick) return
    seenIds.add(soul)
    appendMessage('gun-messages', {
      nick: data.nick,
      text: data.text,
      ts:   data.ts || Date.now()
    })
  })

  // Gun doesn't expose a clean unsubscribe from .map().on()
  // The closest is .off() on the ref — store it for cleanup
  unsubscribe = () => ref.off()
}

// ── Send a message ────────────────────────────────────────────
function sendMessage() {
  const text = msgInput.value.trim()
  const nick = nickInput.value.trim() || 'anon'
  if (!text) return

  /**
   * gun.get('chat').get(room).set({...}) creates a new child node
   * with a unique soul (ID). Gun fans this out to all connected peers
   * via its gossip protocol. Each peer stores it locally and
   * re-announces to their own peers.
   *
   * .set() vs .put():
   *   put() writes to a fixed key (last-write-wins)
   *   set() creates a new unique child node (append-only — better for chat)
   */
  gun.get('chat').get(currentRoom).set({
    nick,
    text,
    ts: Date.now()
  })

  msgInput.value = ''
  msgInput.style.height = 'auto'
}

// ── Peer status indicator ─────────────────────────────────────
// Gun doesn't expose a peer count API directly.
// We check if Gun's internal wire has active connections.
function checkPeerStatus() {
  try {
    const mesh = gun.back('opt.mesh')
    const wireCount = mesh ? Object.keys(mesh.wire || {}).length : 0
    peerStatus.textContent = wireCount > 0
      ? `${wireCount} peer${wireCount !== 1 ? 's' : ''} connected`
      : 'relay connected'
  } catch {
    peerStatus.textContent = 'relay connected'
  }
}

setInterval(checkPeerStatus, 3000)

// ── Event listeners ───────────────────────────────────────────
joinBtn.addEventListener('click', () => joinRoom(roomInput.value))

roomInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') joinRoom(roomInput.value)
})

sendBtn.addEventListener('click', sendMessage)

msgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
})

msgInput.addEventListener('input', () => {
  msgInput.style.height = 'auto'
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px'
})

// ── Init ──────────────────────────────────────────────────────
joinRoom('lobby')
peerStatus.textContent = 'connecting to relay…'
setTimeout(checkPeerStatus, 2000)
