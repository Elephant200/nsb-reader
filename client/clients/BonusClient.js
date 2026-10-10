import { renderReadingText } from '../../shared/render-reading-text.js';
import addBonusGameCard from '../play/bonuses/add-bonus-game-card.js';
import QuestionClient from './QuestionClient.js';
import { MODE_ENUM } from '../../shared/constants.js';
import { BONUS_CLIENT_MESSAGE_TYPE, BONUS_ROOM_MESSAGE_TYPE } from '../../shared/protocol/bonus-room.js';

/**
 * @template {typeof QuestionClient} TBase
 * @param {TBase} ClientClass
 */
export const BonusClientMixin = (ClientClass) => class extends ClientClass {
  constructor (room, userId, socket) {
    super(room, userId, socket);
    attachEventListeners(room, socket);
  }

  onmessage (message) {
    const data = JSON.parse(message);
    switch (data.type) {
      case BONUS_CLIENT_MESSAGE_TYPE.END_CURRENT_BONUS: return this.endCurrentBonus(data);
      case BONUS_CLIENT_MESSAGE_TYPE.GIVE_BONUS_ANSWER: return this.giveBonusAnswer(data);
      case BONUS_CLIENT_MESSAGE_TYPE.REVEAL_LEADIN: return this.revealLeadin(data);
      case BONUS_CLIENT_MESSAGE_TYPE.REVEAL_NEXT_ANSWER: return this.revealNextAnswer(data);
      case BONUS_CLIENT_MESSAGE_TYPE.REVEAL_NEXT_PART: return this.revealNextPart(data);
      case BONUS_ROOM_MESSAGE_TYPE.START_BONUS_ANSWER: return this.startBonusAnswer(data);
      case BONUS_CLIENT_MESSAGE_TYPE.START_NEXT_BONUS: return this.startNextBonus(data);
      case BONUS_ROOM_MESSAGE_TYPE.TOGGLE_BONUS_PART: return this.toggleBonusPart(data);
      case BONUS_ROOM_MESSAGE_TYPE.TOGGLE_READ_BONUSES_LIKE_TOSSUPS: return this.toggleReadBonusesLikeTossups(data);
      case BONUS_ROOM_MESSAGE_TYPE.TOGGLE_THREE_PART_BONUSES: return this.toggleThreePartBonuses(data);
      case BONUS_CLIENT_MESSAGE_TYPE.UPDATE_BONUS_QUESTION: return this.updateBonusQuestion(data);
      default: return super.onmessage(message);
    }
  }

  endCurrentBonus ({ bonus, starred }) {
    addBonusGameCard({ bonus, starred });
  }

  giveBonusAnswer ({ currentPartNumber, directive, directedPrompt, userId }) {
    super.giveAnswer({ directive, directedPrompt, userId });

    document.getElementById('reveal').disabled = true;
  }

  revealLeadin ({ leadin }) {
    const paragraph = document.createElement('p');
    paragraph.id = 'leadin';
    paragraph.innerHTML = renderReadingText(leadin, { formatChoices: false });
    document.getElementById('question').appendChild(paragraph);
  }

  revealNextAnswer ({ answer, question, correct, currentPartNumber, lastPartRevealed }) {
    if (question) document.getElementById(`bonus-part-${currentPartNumber + 1}`).querySelector('p').innerHTML = renderReadingText(question, { formatChoices: false });
    document.getElementById('answer').innerHTML = 'ANSWER: ' + renderReadingText(answer, { formatChoices: false });
    this.updateBonusFeedback(correct);

    if (lastPartRevealed) {
      document.getElementById('reveal').disabled = true;
      document.getElementById('next').textContent = 'Next';
      document.getElementById('next').disabled = false;
    }
  }

  revealNextPart ({ bonusEligibleTeamId, currentPartNumber, part, value }) {
    document.getElementById('reveal').disabled = !(
      bonusEligibleTeamId === undefined ||
      bonusEligibleTeamId === this.room.players[this.USER_ID]?.teamId
    );

    const p = document.createElement('p');
    p.innerHTML = renderReadingText(part, { formatChoices: false });

    const bonusPart = document.createElement('div');
    bonusPart.id = `bonus-part-${currentPartNumber + 1}`;
    bonusPart.appendChild(p);

    document.getElementById('question').appendChild(bonusPart);
    document.getElementById('reveal').textContent = 'Buzz';
  }

  startBonusAnswer ({ userId } = {}) {
    document.getElementById('reveal').disabled = true;
    document.getElementById('next').disabled = true;
    if (userId && userId !== this.USER_ID) return;
    document.getElementById('answer-input-group').classList.remove('d-none');
    document.getElementById('answer-input').focus();
  }

  startNextBonus ({ bonus, packetLength }) {
    this.startNextQuestion({ packetLength, question: bonus });
    document.getElementById('buzz')?.classList.add('d-none');
    document.getElementById('pause')?.classList.add('d-none');
    document.getElementById('reveal').classList.remove('d-none');
    document.getElementById('next').textContent = 'Skip';
    document.getElementById('bonus-answer-feedback')?.classList.add('d-none');
    document.getElementById('reveal').textContent = 'Buzz';
  }

  setMode ({ mode }) {
    super.setMode({ mode });
    switch (mode) {
      case MODE_ENUM.SET_NAME:
        document.getElementById('toggle-standard-only').disabled = true;
        document.getElementById('toggle-three-part-bonuses').disabled = true;
        break;
      case MODE_ENUM.RANDOM:
        document.getElementById('toggle-standard-only').disabled = false;
        document.getElementById('toggle-three-part-bonuses').disabled = false;
        break;
    }
  }

  toggleBonusPart ({ partNumber, correct }) {
    this.updateBonusFeedback(correct);
  }

  updateBonusFeedback (correct) {
    const feedback = document.getElementById('bonus-answer-feedback');
    if (!feedback) return;
    const owner = this.room.ownerId === undefined || this.room.ownerId === this.USER_ID;
    feedback.classList.toggle('d-none', !owner);
    document.getElementById('bonus-correctness-label').textContent = correct ? 'right' : 'wrong';
    const button = document.getElementById('toggle-bonus-correctness');
    button.textContent = correct ? 'I was wrong' : 'I was right';
    button.dataset.correct = String(!!correct);
  }

  toggleThreePartBonuses ({ threePartBonuses }) {
    document.getElementById('toggle-three-part-bonuses').checked = threePartBonuses;
  }

  toggleReadBonusesLikeTossups ({ readBonusLikeATossup }) {
    document.getElementById('toggle-read-bonuses-like-tossups').checked = readBonusLikeATossup;
    document.getElementById('reading-speed-container').classList.toggle('d-none', !readBonusLikeATossup);
  }

  updateBonusQuestion ({ word, currentPartNumber }) {
    if (currentPartNumber === -1) {
      document.getElementById('leadin').innerHTML += renderReadingText(word) + ' ';
    } else {
      document.getElementById(`bonus-part-${currentPartNumber + 1}`).querySelector('p').innerHTML += renderReadingText(word) + ' ';
    }
  }
};

function attachEventListeners (room, socket) {
  document.getElementById('toggle-bonus-correctness')?.addEventListener('click', function (event) {
    event.preventDefault();
    socket.sendToServer({ type: BONUS_ROOM_MESSAGE_TYPE.TOGGLE_BONUS_PART, partNumber: 0, correct: this.dataset.correct !== 'true' });
  });
  document.getElementById('reveal').addEventListener('click', function () {
    this.blur();
    socket.sendToServer({ type: BONUS_ROOM_MESSAGE_TYPE.START_BONUS_ANSWER });
  });
}

const BonusClient = BonusClientMixin(QuestionClient);
export default BonusClient;
