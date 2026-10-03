import { escapeHTML } from '../../../shared/string-utils.js';
import { renderReadingText } from '../../../shared/render-reading-text.js';
import { questionReadingHeader } from '../../../shared/question-reading-header.js';
import { CATEGORIES } from '../../../shared/categories.js';
import installRosterDrag from './roster-drag.js';

const { WebSocket, localStorage, sessionStorage } = window;
const root = document.getElementById('in-person-app');
const params = new URLSearchParams(window.location.search);
let code = params.get('code') || '';
let role = params.get('role') === 'reader' ? 'reader' : 'player';
let socket;
let state = null;
let connected = false;
let fatal = false;
let notice = '';
let tab = 'question';
let sets = [];
let selection = { category: '', setName: '', packetNumber: 1 };
let dragging = false;
let interruptOverride = null;
let pendingId = null;
let receivedAt = 0;
let receivedRemaining = 0;
let retry;
let mobileConfig = false;
let editingUsername = false;
let usernameDraft = '';
let endArmedAt = 0;
let endResetTimeout;
const usernameKey = 'nsb-in-person-username';

function button (action, label, style = 'outline-secondary', disabled = false) {
  return `<button type="button" class="btn btn-${style}" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
}

function send (type, values = {}) {
  if (connected && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...values }));
}

function entry () {
  return `<div class="room-entry"><h1 class="h3 mb-4">In-person practice</h1><form id="join-room"><label class="form-label" for="room-code">Room code</label><input id="room-code" class="form-control form-control-lg room-code mb-3" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required value="${escapeHTML(code)}"><button class="btn btn-primary w-100" type="submit">Join room</button></form><div class="border-top mt-4 pt-4">${button('create', 'Create room', 'outline-primary w-100')}</div></div>`;
}

function timer () {
  const disabled = !state.pair || state.result !== null || !!state.pending;
  return `<div class="text-center"><div class="small text-uppercase text-body-secondary">Timer</div><div class="timer-number" data-timer>00</div><div class="small my-2" data-timer-status></div><div class="d-flex gap-2 justify-content-center">${button(state.timer.deadline === null ? 'start-timer' : 'pause-timer', state.timer.started && state.timer.deadline === null ? 'Resume' : 'Pause', 'outline-secondary', disabled || !state.timer.started || state.timer.remaining <= 0)}${button('reset-timer', 'Reset', 'outline-secondary', disabled)}</div></div>`;
}

function question () {
  if (!state.pair) return `<div class="question-stage border rounded p-4 mb-4 d-flex align-items-center justify-content-center">${button('next', 'Load question', 'primary', state.loading)}</div>`;
  const bonus = state.kind === 'bonus';
  const q = bonus ? state.pair.bonus : state.pair.tossup;
  const prompt = bonus ? [q.leadin, q.parts[0]].filter(Boolean).join('<br>') : q.question;
  const answer = bonus ? q.answers[0] : q.answer;
  const player = state.pending && state.players[state.pending.id];
  const attempt = state.pending || state.judgedAttempt;
  const interrupt = interruptOverride ?? attempt?.interrupt ?? false;
  const heading = questionReadingHeader(q.category, prompt, answer);
  const judged = state.result !== null;
  const disabled = !bonus && !attempt;
  const advance = judged || state.timer.started;
  return `<div class="border-bottom pb-3 mb-4 text-body-secondary">${escapeHTML(q.set.name)} · Packet ${q.packet.number} · Question ${q.number}</div><div class="d-flex justify-content-between mb-3"><strong>${bonus ? 'Bonus' : 'Tossup'} · ${escapeHTML(heading)}</strong>${bonus ? `<span>Team ${state.bonusTeam === 0 ? 'A' : 'B'}</span>` : ''}</div>
    <div class="question-stage border rounded p-4 ${player ? 'has-buzz' : ''}"><div class="question-copy" ${player ? 'aria-hidden="true"' : ''}>${renderReadingText(prompt)}</div>${player ? `<div class="buzz-overlay" role="status"><div class="text-primary fw-bold fs-4">BUZZ</div><div class="buzz-title">${escapeHTML(player.title)}</div><div class="text-body-secondary fs-5">${escapeHTML(player.username)}</div><label class="mt-3"><input id="interrupt" type="checkbox" ${interrupt ? 'checked' : ''}> Interrupt</label></div>` : ''}</div>
    <div class="answer-section border-bottom py-4 mb-4"><div class="answer-copy"><div class="small text-body-secondary mb-2">ANSWER</div><div class="fs-3">${renderReadingText(answer)}</div>${judged ? `<div class="mt-2 text-${state.result ? 'success' : 'danger'}">${state.result ? 'Right' : 'Wrong'}</div>` : ''}</div><div class="d-grid gap-2 judge-buttons">${button('right', '✓ Right', 'success', disabled)}${button('wrong', '✕ Wrong', 'danger', disabled)}${button('no-answer', 'No answer', 'outline-secondary', !!player || judged)}</div></div>
    <div class="question-advance">${advance ? button('next', state.loading ? 'Loading…' : 'Next', 'primary', !!player || state.loading) : button('start-timer', 'Start timer', 'primary', !!player || state.loading)}</div>`;
}

function roster () {
  return `<h2 class="h4 mb-4">Roster</h2><div class="row g-4">${state.teams.map((ids, team) => `<section class="col-6"><div class="d-flex justify-content-between mb-3"><h3 class="h5">Team ${team === 0 ? 'A' : 'B'}</h3><span class="text-body-secondary">${ids.length}</span></div><div class="roster-column" data-roster-team="${team}">${ids.map((id, index) => {
    const p = state.players[id];
    return `<div class="roster-slot border rounded" data-player="${id}" data-team="${team}" data-index="${index}"><button type="button" class="btn btn-sm text-body-secondary" data-drag-handle aria-label="Move ${escapeHTML(p.username)}" ${state.pending ? 'disabled' : ''}>⠿</button><div class="roster-name"><strong>${escapeHTML(p.title)}</strong><div class="small text-body-secondary">${escapeHTML(p.username)}</div></div><div class="ms-auto d-flex align-items-center gap-2"><span class="connection-dot ${p.online ? '' : 'offline'}" title="${p.online ? 'Connected' : 'Disconnected'}"></span><button type="button" class="btn btn-sm btn-outline-danger" data-kick="${id}" aria-label="Kick ${escapeHTML(p.username)}">×</button></div></div>`;
  }).join('')}<div class="roster-end"></div></div></section>`).join('')}</div>`;
}

function statistics () {
  return `<h2 class="h4 mb-4">Statistics</h2><div class="table-responsive"><table class="table align-middle"><thead><tr><th>Player</th><th>Buzzes</th><th>Right</th><th>Wrong</th><th>Interrupts</th></tr></thead><tbody>${Object.values(state.players).map(p => `<tr><th>${escapeHTML(p.title)}${p.kicked ? ' · Removed' : ''}<div class="small fw-normal text-body-secondary">${escapeHTML(p.username)}</div></th><td>${p.buzzes}</td><td>${p.correct}</td><td>${p.misses}</td><td>${p.interrupts}</td></tr>`).join('')}</tbody></table></div><h3 class="h5 mt-4">Bonuses</h3><table class="table"><thead><tr><th>Team</th><th>Right</th><th>Wrong</th></tr></thead><tbody>${state.bonuses.map((b, i) => `<tr><th>${i === 0 ? 'A' : 'B'}</th><td>${b.correct}</td><td>${b.misses}</td></tr>`).join('')}</tbody></table>`;
}

function settings () {
  return `<h2 class="h4 mb-4">Questions</h2><div class="mb-3"><label class="form-label" for="category">Category</label><select id="category" class="form-select" data-setting="category"><option value="">All categories</option>${CATEGORIES.map(c => `<option ${selection.category === c ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('')}</select></div><div class="mb-3"><label class="form-label" for="setName">Set</label><select id="setName" class="form-select" data-setting="setName"><option value="">Random questions</option>${sets.map(s => `<option ${selection.setName === s ? 'selected' : ''}>${escapeHTML(s)}</option>`).join('')}</select></div><div class="mb-3"><label class="form-label" for="packetNumber">Packet</label><input id="packetNumber" class="form-control" type="number" min="1" max="1000" data-setting="packetNumber" value="${selection.packetNumber}" ${selection.setName ? '' : 'disabled'}></div>`;
}

function reader () {
  const mobile = window.matchMedia('(max-width: 767px)').matches;
  const activeTab = mobile && !mobileConfig ? 'question' : tab;
  return `<div class="reader-shell ${mobileConfig ? 'mobile-config' : 'mobile-reading'}"><div class="d-flex d-md-none justify-content-end mb-3">${button('mobile-config', mobileConfig ? '← Questions' : '<i class="bi bi-sliders" aria-hidden="true"></i> Config')}</div><div class="reader-room-header d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4"><div class="d-flex align-items-center"><span class="small text-body-secondary">Room</span><strong class="room-code fs-3 ms-3">${code}</strong><button type="button" class="btn btn-sm ms-1" data-action="copy" aria-label="Copy room code" title="Copy room code"><i class="bi bi-copy" aria-hidden="true"></i></button></div><div class="d-flex gap-2">${button('lock', state.locked ? 'Unlock room' : 'Lock room')}${button('end', endArmedAt ? 'Confirm End' : 'End', endArmedAt ? 'danger' : 'outline-danger', !!endArmedAt && Date.now() - endArmedAt < 500)}</div></div><div class="workspace"><aside class="border-end pe-4"><div class="reader-tabs d-grid gap-2 mb-4">${[['question', 'Question'], ['roster', 'Roster'], ['statistics', 'Statistics'], ['settings', 'Question selection']].map(([key, label]) => button(`${key}-tab`, label, activeTab === key ? 'primary' : 'outline-secondary')).join('')}</div><div class="border-top border-bottom py-3 mb-4"><div>Team A <strong class="float-end fs-4">${state.scores[0]}</strong></div><div class="mt-3">Team B <strong class="float-end fs-4">${state.scores[1]}</strong></div></div>${timer()}</aside><section>${({ question, roster, statistics, settings })[activeTab]()}</section></div></div>`;
}

function player () {
  return `<div class="d-flex justify-content-end gap-2">${button('edit-username', 'Username')}${button('leave', 'Leave')}</div>${editingUsername ? `<form id="username-form" class="username-form mt-3"><label class="form-label" for="username">Username</label><div class="d-flex gap-2"><input class="form-control" id="username" maxlength="32" required autocomplete="nickname" value="${escapeHTML(usernameDraft)}"><button class="btn btn-primary" type="submit">Save</button>${button('cancel-username', 'Cancel')}</div></form>` : ''}<div class="buzzer-stage"><button class="big-buzzer ${state.buzzed ? 'is-buzzed' : ''}" data-action="buzz" ${!connected || !state.canBuzz ? 'disabled' : ''}>${state.buzzed ? 'BUZZ' : 'Buzz'}</button></div><div class="player-role">${escapeHTML(state.title)}<div class="player-username text-body-secondary">${escapeHTML(state.username)}</div></div>`;
}

function render () {
  if (dragging) return;
  const editingFocus = document.activeElement?.id === 'username';
  const selectionStart = editingFocus ? document.activeElement.selectionStart : null;
  const selectionEnd = editingFocus ? document.activeElement.selectionEnd : null;
  root.innerHTML = `${notice ? `<div class="alert alert-secondary" role="status">${escapeHTML(notice)}</div>` : ''}${!state ? entry() : role === 'reader' ? reader() : player()}`;
  if (!connected && state) root.querySelectorAll('button:not([data-action="leave"])').forEach(b => { b.disabled = true; });
  updateTimer();
  if (editingFocus && document.getElementById('username')) {
    document.getElementById('username').focus();
    document.getElementById('username').setSelectionRange(selectionStart, selectionEnd);
  }
}

function updateTimer () {
  if (role !== 'reader' || !state) return;
  const remaining = Math.max(0, receivedRemaining - (state.timer.deadline !== null ? performance.now() - receivedAt : 0));
  const timerNode = root.querySelector('[data-timer]');
  if (timerNode) timerNode.textContent = String(Math.ceil(remaining / 1000)).padStart(2, '0');
  const status = root.querySelector('[data-timer-status]');
  if (status) status.textContent = remaining === 0 ? 'Time' : state.timer.deadline !== null ? 'Running' : state.timer.started ? 'Paused' : '';
}

function connect () {
  clearTimeout(retry);
  let token;
  try {
    const key = `nsb-in-person:${code}:${role}`;
    token = localStorage.getItem(key);
    if (!token && role === 'player') {
      token = Array.from(window.crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(key, token);
    }
    if (!token) throw new Error('Reader access is not saved in this browser.');
  } catch (error) { notice = error.message; render(); return; }
  notice = 'Connecting…';
  render();
  const query = new URLSearchParams({ code, role, token });
  if (role === 'player' && localStorage.getItem(usernameKey)) query.set('username', localStorage.getItem(usernameKey));
  socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/reader-room?${query}`);
  socket.addEventListener('open', () => { connected = true; notice = ''; });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.type === 'room-ended') {
      fatal = true;
      connected = false;
      state = null;
      localStorage.removeItem(`nsb-in-person:${code}:${role}`);
      code = '';
      endArmedAt = 0;
      clearTimeout(endResetTimeout);
      notice = 'Room ended.';
      window.history.replaceState(null, '', '/play/in-person/');
      render();
      return;
    }
    if (message.type === 'username-saved') {
      localStorage.setItem(usernameKey, message.username);
      editingUsername = false;
      notice = '';
      return;
    }
    if (message.type === 'error') {
      notice = message.message;
      fatal = !!message.fatal;
      if (fatal) connected = false;
      render();
      return;
    }
    if (message.type !== 'state') return;
    state = message;
    if (role === 'player') localStorage.setItem(usernameKey, state.username);
    if (role === 'reader') {
      if (pendingId !== state.pending?.id) interruptOverride = null;
      pendingId = state.pending?.id;
      receivedRemaining = state.timer.remaining;
      receivedAt = performance.now();
    }
    if (!fatal) notice = role === 'player' && !state.readerOnline ? 'Reader disconnected' : '';
    render();
  });
  socket.addEventListener('close', () => {
    connected = false;
    if (!fatal) { notice = 'Disconnected. Reconnecting…'; retry = setTimeout(connect, 2000); }
    render();
  });
}

function enterRoom (newCode, newRole) {
  code = newCode;
  role = newRole;
  fatal = false;
  window.history.replaceState(null, '', `?${new URLSearchParams({ code, role })}`);
  connect();
}

root.addEventListener('submit', event => {
  if (event.target.id === 'username-form') {
    event.preventDefault();
    send('set-username', { username: usernameDraft });
    return;
  }
  if (event.target.id !== 'join-room') return;
  event.preventDefault();
  const value = document.getElementById('room-code').value.trim();
  if (/^\d{6}$/.test(value)) enterRoom(value, 'player');
});
root.addEventListener('input', event => {
  if (event.target.id === 'username') usernameDraft = event.target.value;
});
root.addEventListener('change', event => {
  if (event.target.id === 'interrupt') interruptOverride = event.target.checked;
  const setting = event.target.dataset.setting;
  if (setting) {
    selection = { ...selection, [setting]: setting === 'packetNumber' ? Math.max(1, Math.min(1000, Number(event.target.value) || 1)) : event.target.value };
    sessionStorage.setItem(`nsb-in-person-selection:${code}`, JSON.stringify(selection));
    if (setting === 'setName') render();
  }
});
root.addEventListener('click', async event => {
  const kick = event.target.closest('[data-kick]');
  if (kick) { send('kick', { id: kick.dataset.kick }); return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'mobile-config') {
    mobileConfig = !mobileConfig;
    if (mobileConfig && tab === 'question') tab = 'roster';
    if (!mobileConfig) tab = 'question';
    render();
    return;
  }
  if (action.endsWith('-tab')) { tab = action.replace('-tab', ''); if (tab === 'question') mobileConfig = false; render(); return; }
  if (action === 'edit-username') { editingUsername = true; usernameDraft = state.username; render(); document.getElementById('username').focus(); return; }
  if (action === 'cancel-username') { editingUsername = false; render(); return; }
  if (action === 'end') {
    const elapsed = Date.now() - endArmedAt;
    if (endArmedAt && elapsed >= 500 && elapsed < 6000) { send('end-room'); return; }
    if (endArmedAt && elapsed < 500) return;
    endArmedAt = Date.now();
    clearTimeout(endResetTimeout);
    setTimeout(render, 510);
    endResetTimeout = setTimeout(() => { endArmedAt = 0; render(); }, 6000);
    render();
    return;
  }
  if (action === 'create') {
    event.target.disabled = true;
    try {
      const response = await fetch('/api/reader-room', { method: 'POST' });
      if (!response.ok) throw new Error('Unable to create room. Try again later.');
      const room = await response.json();
      localStorage.setItem(`nsb-in-person:${room.code}:reader`, room.readerToken);
      enterRoom(room.code, 'reader');
    } catch (error) { notice = error.message; render(); }
  } else if (action === 'leave') {
    fatal = true;
    clearTimeout(retry);
    socket?.close();
    window.location.href = '/play/in-person/';
  } else if (action === 'copy') {
    try { await navigator.clipboard.writeText(code); const icon = root.querySelector('[data-action="copy"] i'); if (icon) icon.className = 'bi bi-check2'; } catch { notice = `Room code: ${code}`; render(); }
  } else if (action === 'lock') send('lock', { locked: !state.locked });
  else if (action === 'next') {
    notice = '';
    if (state.pair && state.result === null && !state.pending) send('no-answer');
    send('next', selection);
  } else if (['right', 'wrong'].includes(action)) send('judge', { correct: action === 'right', interrupt: interruptOverride ?? state.pending?.interrupt ?? state.judgedAttempt?.interrupt ?? false });
  else if (action === 'buzz') { if (state?.canBuzz) { send('buzz'); event.target.disabled = true; } } else send(action);
});
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || !state || event.target.closest('input, select, textarea, a, [contenteditable]')) return;
  if (role === 'reader') {
    const advance = root.querySelector('.question-advance button');
    if (!advance) return;
    event.preventDefault();
    if (!event.repeat && connected && !advance.disabled) advance.click();
    return;
  }
  if (event.target.closest('button') && event.target.dataset.action !== 'buzz') return;
  event.preventDefault();
  if (!event.repeat && connected && state.canBuzz) send('buzz');
});
installRosterDrag(root, (id, team, index) => send('move-player', { id, team, index }), value => { dragging = value; if (!value) render(); });
setInterval(updateTimer, 100);
window.matchMedia('(max-width: 767px)').addEventListener('change', render);
fetch('/api/set-list').then(r => r.json()).then(data => { sets = data.setList; if (tab === 'settings') render(); }).catch(() => {});
if (/^\d{6}$/.test(code)) {
  try { selection = JSON.parse(sessionStorage.getItem(`nsb-in-person-selection:${code}`)) || selection; } catch {}
  connect();
} else render();
