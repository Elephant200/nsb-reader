import tossupToHTML from '../../scripts/tossup-to-html.js';

const tossupId = new URLSearchParams(window.location.search).get('_id');
const { tossup } = await fetch('/api/tossup?' + new URLSearchParams({ _id: tossupId })).then(res => res.json());

document.getElementById('spinner').classList.add('d-none');

document.getElementById('packet-link').href = `../packet/?_id=${tossup.packet._id}`;
document.getElementById('packet-number').textContent = tossup.packet.number;
document.getElementById('packet-name').textContent = tossup.packet.name;

document.getElementById('set-name').href = `../set/?_id=${tossup.set._id}`;
document.getElementById('set-name').textContent = tossup.set.name;

document.getElementById('tossup').appendChild(tossupToHTML(tossup));

document.getElementById('_id').textContent = tossup._id;
document.getElementById('difficulty').textContent = tossup.difficulty;
document.getElementById('standard').textContent = tossup.set.standard;
document.getElementById('time-created').textContent = new Date(tossup.createdAt).toLocaleString();
document.getElementById('last-modified').textContent = new window.Date(tossup.updatedAt).toLocaleString();
