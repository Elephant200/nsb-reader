import ServerMultiplayerRoomMixin from './ServerMultiplayerRoomMixin.js';
import TossupBonusRoom from '../../shared/rooms/TossupBonusRoom.js';
import { QUESTION_TYPE_ENUM, TOSSUP_PROGRESS_ENUM } from '../../shared/constants.js';

export default class ServerTossupBonusRoom extends ServerMultiplayerRoomMixin(TossupBonusRoom) {
  constructor (name, ownerId, isPermanent, categoryManager, isVerified = false) {
    super(name, ownerId, isPermanent, categoryManager, ['tossups', 'bonuses'], isVerified);
  }

  giveAnswerLiveUpdate ({ userId, username }, { givenAnswer }) {
    switch (this.currentQuestionType) {
      case QUESTION_TYPE_ENUM.TOSSUP:
        if (userId !== this.buzzedIn) { return false; }
        break;
      case QUESTION_TYPE_ENUM.BONUS:
        if (!this.canUserAnswerBonus({ userId, username })) { return false; }
        break;
    }
    super.giveAnswerLiveUpdate({ userId, username }, { givenAnswer });
  }

  giveTossupAnswer ({ userId, username }, { givenAnswer }) {
    if (typeof givenAnswer !== 'string') { return false; }
    if (this.buzzedIn !== userId) { return false; }

    if (Object.keys(this.tossup || {}).length === 0) { return; }

    super.giveTossupAnswer({ userId, username }, { givenAnswer });
  }

  next ({ userId, username }) {
    if (!this.allowed(userId)) return false;
    if (
      this.currentQuestionType === QUESTION_TYPE_ENUM.TOSSUP &&
      this.tossupProgress === TOSSUP_PROGRESS_ENUM.READING &&
      this.wordIndex < 3
    ) { return false; }
    return super.next({ userId, username });
  }

  toggleCorrect ({ userId, username }, { targetUserId }) {
    if (targetUserId !== this.previousTossup.userId || !this.players[targetUserId]) return;
    if (this.currentQuestionType !== QUESTION_TYPE_ENUM.TOSSUP) { return; }
    if (this.settings.public) { return; }
    if (userId !== this.ownerId) { return; }
    super.toggleCorrect({ userId, username }, { targetUserId });
    this.bonusEligibleTeamId = this.previousTossup.isCorrect ? this.players[targetUserId].teamId : null;
    this.emitMessage({ type: 'set-bonus-eligible-team-id', teamId: this.bonusEligibleTeamId });
    if (this.previousTossup.isCorrect) {
      clearTimeout(this.timeoutID);
      clearInterval(this.timer.interval);
      this.buzzedIn = null;
      this.revealTossupAnswer();
    }
  }
}
