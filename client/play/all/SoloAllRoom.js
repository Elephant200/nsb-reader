import api from '../../scripts/api/index.js';
import TossupBonusRoom from '../../../shared/rooms/TossupBonusRoom.js';
import { QUESTION_TYPE_ENUM } from '../../../shared/constants.js';

export default class SoloAllRoom extends TossupBonusRoom {
  checkAnswer = api.checkAnswer;
  getRandomTossups = api.getRandomTossup;
  getRandomBonuses = api.getRandomBonus;
  getPacketCount = api.getNumPackets;
  getPairedBonus = api.getPairedBonus;
  getPacket = async ({ setName, packetNumber }) => ({
    tossups: await api.getPacketTossups(setName, packetNumber),
    bonuses: await api.getPacketBonuses(setName, packetNumber)
  });

  constructor (name, categoryManager) {
    super(name, categoryManager);
    this.settings = { ...this.settings, enableBonuses: true, alwaysShowBonuses: true, skip: true, typeToAnswer: true };
  }

  async message (player, message) {
    if (message.type === 'toggle-always-show-bonuses') {
      this.settings.alwaysShowBonuses = !!message.alwaysShowBonuses;
      return;
    }
    if (message.type === 'toggle-type-to-answer') {
      this.settings.typeToAnswer = !!message.typeToAnswer;
      return;
    }
    return super.message(player, message);
  }

  async next (player) {
    if (this.currentQuestionType === QUESTION_TYPE_ENUM.TOSSUP && this.settings.alwaysShowBonuses) {
      this.bonusEligibleTeamId = this.players[player.userId].teamId;
    }
    return super.next(player);
  }

  buzz (player) {
    if (!this.settings.typeToAnswer && this.buzzedIn === player.userId) {
      return this.giveTossupAnswer(player, { givenAnswer: this.tossup.answer_sanitized });
    }
    return super.buzz(player);
  }

  startBonusAnswer (player) {
    if (!this.settings.typeToAnswer) {
      super.startBonusAnswer(player);
      return this.giveBonusAnswer(player, { givenAnswer: this.bonus.answers_sanitized[this.currentPartNumber] });
    }
    return super.startBonusAnswer(player);
  }

  toggleCorrect (player, message) {
    super.toggleCorrect(player, message);
    this.bonusEligibleTeamId = this.previousTossup.isCorrect ? this.players[player.userId].teamId : null;
  }

  get liveAnswer () { return document.getElementById('answer-input')?.value ?? ''; }
  set liveAnswer (value) { const input = document.getElementById('answer-input'); if (input) input.value = value; }
}
