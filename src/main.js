// ── Tab switching ──────────────────────────────────────────────
const tabs = document.querySelectorAll('.tab-btn')
const panels = document.querySelectorAll('.panel')

tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'))
    panels.forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById(`${btn.dataset.tab}-panel`).classList.add('active')
  })
})

// ── Shared utilities ───────────────────────────────────────────
export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function appendMessage(containerId, { nick, text, ts, system = false }) {
  const el = document.getElementById(containerId)
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

// ── Boot both implementations ──────────────────────────────────
import './gun/gun-chat.js'
import './yjs/yjs-chat.js'
