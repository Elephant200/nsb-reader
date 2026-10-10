import getRandomName from '../../../shared/get-random-name.js';

const ROOM_NAME_MAX_LENGTH = 32;

document.getElementById('form').addEventListener('submit', (event) => {
  event.preventDefault();

  let roomName = document.getElementById('new-room-name').value;
  if (roomName.length === 0) {
    roomName = document.getElementById('new-room-name').placeholder;
  } else {
    roomName = roomName.replaceAll(' ', '-');
  }

  roomName = roomName.substring(0, ROOM_NAME_MAX_LENGTH);

  const isPrivate = document.getElementById('private-room-checkbox').checked;
  const isControlled = document.getElementById('controlled-room-checkbox').checked;

  const params = new URLSearchParams();

  if (isPrivate) params.set('private', 'true');
  if (isControlled) params.set('controlled', 'true');

  window.location.href = `./${encodeURIComponent(roomName)}?${params.toString()}`;
});

document.getElementById('new-room-name').placeholder = getRandomName();
