// ── Tab switching ──────────────────────────────────────────────
const tabs   = document.querySelectorAll('.tab-btn')
const panels = document.querySelectorAll('.panel')

let activeTab = 'gun'

tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab
    tabs.forEach(t => t.classList.remove('active'))
    panels.forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById(`${activeTab}-panel`).classList.add('active')
    document.body.dataset.active = activeTab
  })
})

// ── Shared room input (navbar) ─────────────────────────────────
const roomInput = document.getElementById('room-input')
const joinBtn   = document.getElementById('join-btn')

export function dispatchJoin(room) {
  if (activeTab === 'gun') window._gunJoinRoom?.(room)
  if (activeTab === 'yjs') window._yjsJoinRoom?.(room)
}

joinBtn.addEventListener('click', () => dispatchJoin(roomInput.value))
roomInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') dispatchJoin(roomInput.value)
})

// ── Recent rooms — per panel, max 5, MRU order ────────────────
const MAX_ROOMS = 5
const LS_KEY = { gun: 'p2p-recent-gun', yjs: 'p2p-recent-yjs' }

// Load from localStorage on startup, fall back to empty
const recentRooms = {
  gun: JSON.parse(localStorage.getItem(LS_KEY.gun) || '[]'),
  yjs: JSON.parse(localStorage.getItem(LS_KEY.yjs) || '[]'),
}

function saveRooms(tab) {
  localStorage.setItem(LS_KEY[tab], JSON.stringify(recentRooms[tab]))
}

export function pushRoom(tab, room) {
  const list = recentRooms[tab]
  const existing = list.indexOf(room)
  if (existing !== -1) list.splice(existing, 1)
  list.unshift(room)
  if (list.length > MAX_ROOMS) list.splice(MAX_ROOMS)
  saveRooms(tab)
  renderRoomBadges(tab)
}

/**
 * Badge brightness by recency:
 * idx 0 (current / most recent) → full color (opacity 1.0)
 * idx 1 → 0.65
 * idx 2 → 0.45
 * idx 3 → 0.30
 * idx 4 → 0.20
 * Active badge always overrides to full color regardless of index.
 */
const BADGE_OPACITY = [1.0, 0.65, 0.45, 0.30, 0.20]

function renderRoomBadges(tab) {
  const header  = document.getElementById(`${tab}-chat-header`)
  const list    = recentRooms[tab]
  const current = tab === 'gun'
    ? window._gunCurrentRoom?.()
    : window._yjsCurrentRoom?.()

  const existing = {}
  header.querySelectorAll('.room-badge').forEach(el => {
    existing[el.dataset.room] = el
  })

  // Animate out evicted rooms
  Object.keys(existing).forEach(room => {
    if (!list.includes(room)) {
      const el = existing[room]
      el.classList.add('exiting')
      el.addEventListener('animationend', () => el.remove(), { once: true })
    }
  })

  // Insert / reorder / style remaining
  list.forEach((room, idx) => {
    let el = existing[room]

    if (!el) {
      el = document.createElement('span')
      el.className = 'room-badge entering'
      el.dataset.room = room
      el.textContent = `#${room}`
      el.addEventListener('animationend', () => el.classList.remove('entering'), { once: true })
      el.addEventListener('click', () => {
        roomInput.value = room
        dispatchJoin(room)
      })
    }

    const isActive = room === current
    el.classList.toggle('active', isActive)
    // Active badge always full brightness; others fade by recency
    el.style.opacity = isActive ? '1' : String(BADGE_OPACITY[idx] ?? 0.20)

    const children = Array.from(header.querySelectorAll('.room-badge:not(.exiting)'))
    if (children[idx] !== el) {
      header.insertBefore(el, children[idx] || null)
    }
  })
}

// Render persisted rooms on startup (before any chat module loads)
renderRoomBadges('gun')
renderRoomBadges('yjs')

// ── Shared utilities ───────────────────────────────────────────
export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function appendMessage(containerId, { nick, text, ts, system = false }) {
  const el  = document.getElementById(containerId)
  const div = document.createElement('div')
  div.className = 'msg' + (system ? ' system' : '')
  if (system) {
    div.innerHTML = `<div class="text">${text}</div>`
  } else {
    div.innerHTML = `
      <div>
        <div class="meta">
          <span class="nick">${escHtml(nick)}</span>
          <span class="time">${formatTime(ts)}</span>
        </div>
        <div class="text">${escHtml(text)}</div>
      </div>`
  }
  el.appendChild(div)
  el.scrollTop = el.scrollHeight
}

export function clearMessages(containerId) {
  document.getElementById(containerId).innerHTML = ''
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Boot chat modules AFTER all exports are defined ───────────
// Dynamic import prevents hoisting — modules run after this file
// is fully initialised, so pushRoom/recentRooms are ready.
Promise.all([
  import('./gun/gun-chat.js'),
  import('./yjs/yjs-chat.js'),
])
