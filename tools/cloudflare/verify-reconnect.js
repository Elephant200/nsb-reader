import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';

const base = (process.argv[2] || 'http://localhost:8787').replace(/^http/, 'ws');
const roomName = 'Reload' + Date.now();
const sockets = [];
function connect (userId = 'unknown') {
  const messages = [];
  const ws = new WebSocket(`${base}/play/mp/${roomName}?${new URLSearchParams({ roomName, userId, username: 'ReloadCheck' })}`, { headers: { 'User-Agent': 'NSB reload verification' } });
  sockets.push(ws);
  ws.on('message', data => messages.push(JSON.parse(data)));
  return {
    ws,
    send: message => ws.send(JSON.stringify(message)),
    wait: async (type) => {
      for (let i = 0; i < 500; i++) {
        const match = messages.find(message => message.type === type);
        if (match) return match;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw Error(`Timed out waiting for ${type}`);
    }
  };
}
try {
  const first = connect();
  const identity = await first.wait('connection-acknowledged');
  first.send({ type: 'toggle-timer', timer: false });
  first.send({ type: 'toggle-skip', skip: true });
  first.send({ type: 'next' });
  const question = await first.wait('start-next-tossup');
  first.send({ type: 'buzz' });
  await first.wait('buzz');
  first.send({ type: 'give-answer', givenAnswer: 'deliberately incorrect answer' });
  await first.wait('give-tossup-answer');
  first.send({ type: 'toggle-correct', targetUserId: identity.userId });
  const graded = await first.wait('toggle-correct');
  assert.equal(graded.player.points, 4);
  first.ws.close();
  await once(first.ws, 'close');
  await new Promise(resolve => setTimeout(resolve, 200));
  const reloaded = connect(identity.userId);
  const restored = await reloaded.wait('connection-acknowledged');
  assert.equal(restored.ownerId, identity.ownerId, 'Reload must retain room ownership');
  assert.equal(restored.players[identity.userId].points, 4, 'Reload must retain points after the last player disconnects');
  assert.equal(restored.players[identity.userId].tens, 1, 'Reload must retain correct answers');
  assert.equal(restored.players[identity.userId].buzzes, graded.player.buzzes);
  assert.equal(restored.players[identity.userId].tuh, graded.player.tuh);
  assert.equal(restored.settings.timer, false);
  assert.equal((await reloaded.wait('connection-acknowledged-question')).question._id, question.tossup._id);
  reloaded.send({ type: 'next' });
  await reloaded.wait('start-next-tossup');
  reloaded.send({ type: 'buzz' });
  await reloaded.wait('buzz');
  reloaded.ws.close();
  await once(reloaded.ws, 'close');
  await new Promise(resolve => setTimeout(resolve, 200));
  const answering = connect(identity.userId);
  const pending = await answering.wait('connection-acknowledged');
  assert.equal(pending.buzzedIn, identity.userId, 'Reload must preserve a pending buzz');
  assert.equal((await answering.wait('buzz')).userId, identity.userId);
  answering.send({ type: 'give-answer', givenAnswer: 'wrong answer' });
  await answering.wait('give-tossup-answer');
  answering.send({ type: 'clear-stats' });
  await answering.wait('clear-stats');
  answering.ws.close();
  await once(answering.ws, 'close');
  await new Promise(resolve => setTimeout(resolve, 200));
  const cleared = await connect(identity.userId).wait('connection-acknowledged');
  assert.equal(cleared.players[identity.userId].points, 0);
  console.log('Multiplayer questions, settings, pending buzz, scores, ownership, and explicit resets survived reload.');
} finally { for (const ws of sockets) ws.close(); }
