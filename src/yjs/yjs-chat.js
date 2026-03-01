/**
 * Yjs + y-webrtc Chat
 * ─────────────────────────────────────────────────────────────────
 * How it works:
 *   - Y.Doc is the shared CRDT document. Think of it as a JS object
 *     that magically stays in sync across peers.
 *   - We use a Y.Array<MessageObject> as the chat log (append-only).
 *   - WebrtcProvider connects to a signaling server ONLY to exchange
 *     WebRTC SDP offers/answers. After that, data flows peer-to-peer.
 *   - IndexedDBPersistence persists the Y.Doc locally so messages
 *     survive page reloads without re-fetching from peers.
 *
 * Why Yjs is more efficient than Gun for chat:
 *   - Binary encoding (lib0) vs Gun's JSON graph with metadata overhead
 *   - YATA algorithm produces minimal diffs — only the delta is sent
 *   - Awareness protocol is separate from data — typing indicators
 *     don't bloat the persistent document
 *   - State vectors allow precise "what do you have that I don't" sync
 *
 * The signaling server:
 *   - Only exchanges SDP and ICE candidates (WebRTC handshake)
 *   - Never sees message content
 *   - Completely stateless regarding chat data
 *   - y-webrtc has public signaling servers; you can self-host one
 *     with: npx y-webrtc-server (it's < 50 lines of code)
 */

import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'

import { appendMessage, clearMessages } from '../main.js'

// ── Public signaling servers (stateless — hold zero chat data) ─
const SIGNALING = [
  'wss://signaling.yjs.dev',
  'wss://y-webrtc-signaling-eu.herokuapp.com',
  'wss://y-webrtc-signaling-us.herokuapp.com',
]

// ── State ─────────────────────────────────────────────────────
let doc        = null
let provider   = null
let persistence = null
let messages   = null   // Y.Array
let currentRoom = 'lobby'
let localNick  = 'anon'

// ── DOM refs ──────────────────────────────────────────────────
const roomInput    = document.getElementById('yjs-room-input')
const joinBtn      = document.getElementById('yjs-join-btn')
const nickInput    = document.getElementById('yjs-nick')
const msgInput     = document.getElementById('yjs-msg-input')
const sendBtn      = document.getElementById('yjs-send-btn')
const roomLabel    = document.getElementById('yjs-room-label')
const peerStatus   = document.getElementById('yjs-peer-status')
const typingBar    = document.getElementById('yjs-typing')
const awarenessEl  = document.getElementById('yjs-awareness-note')

// ── Awareness: who's online + typing ─────────────────────────
let typingTimeout = null

function updateAwareness(typing = false) {
  if (!provider) return
  localNick = nickInput.value.trim() || 'anon'
  provider.awareness.setLocalStateField('user', {
    nick: localNick,
    typing,
    color: '#4dffb4'
  })
}

function renderAwareness() {
  if (!provider) return
  const states = Array.from(provider.awareness.getStates().values())

  // Peer count (excluding self)
  const others = states.filter(s => s.user && s.user.nick)
  const peerCount = Math.max(0, others.length - 1)
  peerStatus.textContent = `${peerCount} peer${peerCount !== 1 ? 's' : ''} connected`
  awarenessEl.textContent = `awareness: ${others.length} peer${others.length !== 1 ? 's' : ''}`

  // Typing indicators
  const typing = others
    .filter(s => s.user?.typing && s.user?.nick !== localNick)
    .map(s => s.user.nick)

  if (typing.length === 0) {
    typingBar.textContent = ''
  } else if (typing.length === 1) {
    typingBar.textContent = `${typing[0]} is typing…`
  } else {
    typingBar.textContent = `${typing.slice(0, -1).join(', ')} and ${typing.at(-1)} are typing…`
  }
}

// ── Join / bootstrap a room ───────────────────────────────────
async function joinRoom(room) {
  room = room.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'lobby'
  currentRoom = room
  roomLabel.textContent = `#${room}`
  clearMessages('yjs-messages')
  peerStatus.textContent = 'connecting…'

  // Tear down previous session
  if (provider)    { provider.disconnect(); provider.destroy() }
  if (persistence) { persistence.destroy() }
  if (doc)         { doc.destroy() }

  // ── Create a new Y.Doc ──────────────────────────────────────
  /**
   * Each room gets its own Y.Doc identified by the room name.
   * The WebrtcProvider uses this room name as the "room" signal
   * so only peers in the same room connect to each other.
   */
  doc = new Y.Doc()

  /**
   * Y.Array is an ordered, CRDT-safe array.
   * Perfect for a chat log: append-only, concurrent inserts
   * are handled deterministically by the YATA algorithm.
   */
  messages = doc.getArray('messages')

  // ── IndexedDB persistence ───────────────────────────────────
  /**
   * IndexeddbPersistence loads the Y.Doc from local IndexedDB
   * on startup (so old messages appear immediately, before any
   * peers connect), and writes updates back as they arrive.
   * This is the "room persistence" layer.
   */
  persistence = new IndexeddbPersistence(`p2p-chat-yjs:${room}`, doc)

  await new Promise(resolve => persistence.once('synced', resolve))

  // Render existing messages from local store
  const existing = messages.toArray()
  existing.forEach(m => appendMessage('yjs-messages', m))

  appendMessage('yjs-messages', {
    system: true,
    text: `joined #${room} via yjs + webrtc`,
    ts: Date.now()
  })

  // ── WebRTC provider ─────────────────────────────────────────
  /**
   * WebrtcProvider does two things:
   * 1. Connects to signaling servers to find other peers in this room
   * 2. Once peers are found, establishes direct WebRTC data channels
   *    for all future sync — signaling server is no longer in the loop
   *
   * Sync protocol:
   *   - On connect, peers exchange state vectors
   *     (a compact summary of what each has)
   *   - Only the missing deltas are transmitted (not the full doc)
   *   - Encoded as binary (Uint8Array) via lib0's varint encoding
   */
  provider = new WebrtcProvider(`p2p-chat:${room}`, doc, {
    signaling: SIGNALING,
    maxConns: 20,
    filterBcConns: false,  // also sync via BroadcastChannel (same-browser tabs)
  })

  // ── Listen for document changes ─────────────────────────────
  /**
   * Y.Array observe fires whenever the array changes.
   * The event contains only the delta (inserted/deleted items),
   * not the full array — very efficient for large histories.
   */
  messages.observe(event => {
    event.changes.added.forEach(item => {
      // item.content.getContent() returns the array of values added
      item.content.getContent().forEach(m => {
        if (m && m.text && m.nick) {
          appendMessage('yjs-messages', m)
        }
      })
    })
  })

  // ── Awareness (online presence + typing) ───────────────────
  provider.awareness.on('change', renderAwareness)
  updateAwareness(false)

  // ── Connection status ───────────────────────────────────────
  provider.on('synced', () => {
    renderAwareness()
  })

  provider.on('peers', ({ webrtcPeers }) => {
    const n = webrtcPeers.length
    peerStatus.textContent = `${n} peer${n !== 1 ? 's' : ''} connected`
  })
}

// ── Send a message ────────────────────────────────────────────
function sendMessage() {
  const text = msgInput.value.trim()
  const nick = nickInput.value.trim() || 'anon'
  if (!text || !doc) return

  /**
   * Y.Array.push() appends to the shared array.
   * Yjs encodes this as a minimal binary diff and broadcasts
   * it to all connected WebRTC peers. Each peer applies the
   * delta, which is guaranteed to produce the same final state
   * regardless of order of arrival (CRDT property).
   *
   * The message object is plain JSON — Yjs handles the CRDT magic.
   */
  doc.transact(() => {
    messages.push([{ nick, text, ts: Date.now() }])
  })

  msgInput.value = ''
  msgInput.style.height = 'auto'

  // Clear typing indicator
  clearTimeout(typingTimeout)
  updateAwareness(false)
}

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

  // Typing awareness
  updateAwareness(true)
  clearTimeout(typingTimeout)
  typingTimeout = setTimeout(() => updateAwareness(false), 2000)
})

nickInput.addEventListener('input', () => updateAwareness(false))

// ── Init ──────────────────────────────────────────────────────
joinRoom('lobby')
