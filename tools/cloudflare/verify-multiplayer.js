import assert from 'node:assert/strict';
import WebSocket from 'ws';
const base = (process.argv[2] || 'http://localhost:8787').replace(/^http/, 'ws');
const roomName = 'Check' + Date.now();
function connect (username) {
  const messages = [];
  const ws = new WebSocket(`${base}/play/mp/${roomName}?roomName=${roomName}&userId=unknown&username=${username}`, { headers: { 'User-Agent': 'NSB integration check' } });
  ws.on('message', raw => messages.push(JSON.parse(raw)));
  return {
    ws,
    messages,
    send: message => ws.send(JSON.stringify(message)),
    wait: (type, predicate = () => true, from = 0) => new Promise((resolve, reject) => {
      const inspect = () => {
        const match = messages.slice(from).find(message => message.type === type && predicate(message));
        if (match) { clearTimeout(timer); ws.off('message', inspect); resolve(match); }
      };
      const timer = setTimeout(() => { ws.off('message', inspect); reject(new Error(`Timed out waiting for ${type}: ${JSON.stringify(messages.slice(-4))}`)); }, 10000);
      ws.on('message', inspect);
      inspect();
    })
  };
}
function answer (value) {
  return value.match(/^([WXYZ])\)/i)?.[1] ?? value.split(/\s*\((?:ACCEPT|ALSO ACCEPT)/i)[0];
}
const host = connect('CheckHost');
const hostAck = await host.wait('connection-acknowledged');
const guest = connect('CheckGuest');
const guestAck = await guest.wait('connection-acknowledged');
try {
  host.send({ type: 'toggle-enable-bonuses', enableBonuses: true });
  host.send({ type: 'toggle-timer', timer: false });
  host.send({ type: 'toggle-skip', skip: true });
  host.send({ type: 'next' });
  const { tossup } = await guest.wait('start-next-tossup');
  assert.match(tossup.question_sanitized, /— (Multiple Choice|Short Answer)\./);
  guest.send({ type: 'buzz' });
  await guest.wait('buzz', event => event.userId === guestAck.userId);
  guest.send({ type: 'give-answer', givenAnswer: answer(tossup.answer_sanitized) });
  const result = await guest.wait('give-tossup-answer');
  assert.equal(result.score, 4);
  host.send({ type: 'next' });
  const { bonus } = await guest.wait('start-next-bonus');
  assert.equal(bonus.number, tossup.number);
  assert.equal(bonus.packet._id, tossup.packet._id);
  await guest.wait('reveal-next-part');
  host.send({ type: 'give-answer', givenAnswer: answer(bonus.answers_sanitized[0]) });
  guest.send({ type: 'start-bonus-answer' });
  await guest.wait('start-bonus-answer', event => event.userId === guestAck.userId);
  guest.send({ type: 'give-answer', givenAnswer: answer(bonus.answers_sanitized[0]) });
  const bonusResult = await guest.wait('give-bonus-answer');
  assert.equal(bonusResult.userId, guestAck.userId);
  assert.equal(bonusResult.directive, 'accept');
  host.send({ type: 'next' });
  const end = await guest.wait('end-current-bonus');
  assert.equal(end.stats[10], 1);
  host.send({ type: 'transfer-owner', targetId: guestAck.userId });
  await guest.wait('owner-change', event => event.newOwner === guestAck.userId);
  console.log(JSON.stringify({ multiplayer: 'passed', players: 2, tossupPoints: result.score, bonusPoints: 10, paired: true, ownershipTransfer: true }));
} finally {
  host.ws.close(); guest.ws.close();
}
assert.notEqual(hostAck.userId, guestAck.userId);
