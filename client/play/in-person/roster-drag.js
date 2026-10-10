/** Install pointer and keyboard roster reordering with a live insertion placeholder. */
export default function installRosterDrag (root, onMove, onDragging) {
  let drag = null;
  root.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-drag-handle]');
    if (!handle || handle.disabled || event.button !== 0) return;
    const row = handle.closest('[data-player]');
    const rect = row.getBoundingClientRect();
    const placeholder = document.createElement('div');
    placeholder.className = 'roster-placeholder';
    placeholder.style.height = `${rect.height}px`;
    row.before(placeholder);
    const ghost = row.cloneNode(true);
    ghost.classList.add('roster-ghost');
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.append(ghost);
    row.hidden = true;
    drag = { row, ghost, placeholder, pointer: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    onDragging(true);
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  root.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    drag.ghost.style.left = `${event.clientX - drag.offsetX}px`;
    drag.ghost.style.top = `${event.clientY - drag.offsetY}px`;
    const column = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-roster-team]');
    if (!column) return;
    const rows = [...column.querySelectorAll('[data-player]')].filter(row => row !== drag.row);
    const following = rows.find(row => {
      const rect = row.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    });
    column.insertBefore(drag.placeholder, following || column.querySelector('.roster-end'));
  });
  function finish (event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { row, placeholder, ghost } = drag;
    const team = Number(placeholder.parentElement.dataset.rosterTeam);
    const siblings = [...placeholder.parentElement.children].filter(element => element === placeholder || (element.matches('[data-player]') && element !== row));
    let index = siblings.indexOf(placeholder);
    if (Number(row.dataset.team) === team && Number(row.dataset.index) <= index) index++;
    const id = row.dataset.player;
    row.hidden = false;
    ghost.remove();
    placeholder.remove();
    drag = null;
    if (event.type === 'pointerup') onMove(id, team, index);
    onDragging(false);
  }
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
  root.addEventListener('keydown', event => {
    const row = event.target.closest('[data-player]');
    if (!row || !event.target.closest('[data-drag-handle]') || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    const team = Number(row.dataset.team);
    const index = Number(row.dataset.index);
    const other = 1 - team;
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) onMove(row.dataset.player, other, root.querySelectorAll(`[data-roster-team="${other}"] [data-player]`).length);
    else onMove(row.dataset.player, team, event.key === 'ArrowUp' ? Math.max(0, index - 1) : Math.min(root.querySelectorAll(`[data-roster-team="${team}"] [data-player]`).length, index + 2));
  });
}
