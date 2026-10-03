import CategoryManager from '../../../shared/category-manager.js';
import Player from '../../../shared/Player.js';
import Team from '../../../shared/Team.js';
import { QUESTION_TYPE_ENUM } from '../../../shared/constants.js';
import CategoryModal from '../../scripts/components/CategoryModal.jsx';
import SoloAllRoom from './SoloAllRoom.js';
import SoloAllClient from './SoloAllClient.js';

const USER_ID = 'user';
const room = new SoloAllRoom('', new CategoryManager());
room.players[USER_ID] = new Player(USER_ID);
room.players[USER_ID].teamId = USER_ID;
room.teams[USER_ID] = new Team(USER_ID);
const socket = { sendToServer: message => room.message({ userId: USER_ID, username: '' }, message) };
const client = new SoloAllClient(room, USER_ID, socket);
socket.send = message => client.onmessage(message);
room.sockets[USER_ID] = socket;

document.getElementById('type-to-answer').addEventListener('change', event => socket.sendToServer({ type: 'toggle-type-to-answer', typeToAnswer: event.target.checked }));
document.getElementById('always-show-bonuses').addEventListener('change', event => socket.sendToServer({ type: 'toggle-always-show-bonuses', alwaysShowBonuses: event.target.checked }));
document.getElementById('toggle-correctness').addEventListener('click', event => {
  event.preventDefault();
  if (room.currentQuestionType === QUESTION_TYPE_ENUM.TOSSUP) socket.sendToServer({ type: 'toggle-correct', targetUserId: USER_ID });
  else socket.sendToServer({ type: 'toggle-bonus-part', partNumber: 0, correct: room.pointsPerPart[0] !== 10 });
});
document.addEventListener('keydown', event => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  const id = { ' ': room.currentQuestionType === QUESTION_TYPE_ENUM.TOSSUP ? 'buzz' : 'reveal', n: 'next', p: 'pause', e: 'toggle-settings' }[event.key.toLowerCase()];
  if (id) { event.preventDefault(); document.getElementById(id).click(); }
});
ReactDOM.createRoot(document.getElementById('category-modal-root')).render(
  <CategoryModal categoryManager={room.categoryManager} onClose={() => socket.sendToServer({ type: 'set-categories', ...room.categoryManager.export() })} />
);
