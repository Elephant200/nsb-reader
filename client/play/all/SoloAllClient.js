import TossupBonusClient from '../../clients/TossupBonusClient.js';

export default class SoloAllClient extends TossupBonusClient {
  onmessage (message) {
    const result = super.onmessage(message);
    this.updateStats();
    return result;
  }

  buzz ({ userId }) {
    super.buzz({ userId });
    if (this.room.settings.typeToAnswer) {
      document.getElementById('answer-input-group').classList.remove('d-none');
      document.getElementById('answer-input').focus();
    } else {
      document.getElementById('buzz').disabled = false;
      document.getElementById('buzz').textContent = 'Reveal';
    }
  }

  startNextTossup (data) {
    super.startNextTossup(data);
    document.getElementById('buzz').classList.remove('d-none');
    document.getElementById('pause').classList.remove('d-none');
    document.getElementById('reveal').classList.add('d-none');
    document.getElementById('answer-feedback').classList.add('d-none');
    document.getElementById('next').textContent = 'Skip';
    document.getElementById('next').disabled = false;
  }

  revealTossupAnswer (data) {
    super.revealTossupAnswer(data);
    document.getElementById('buzz').disabled = true;
    document.getElementById('next').disabled = false;
    document.getElementById('next').textContent = 'Next';
    document.getElementById('answer-feedback').classList.remove('d-none');
    this.feedback(this.room.previousTossup.isCorrect);
  }

  startNextBonus (data) {
    super.startNextBonus(data);
    document.getElementById('buzz').classList.add('d-none');
    document.getElementById('pause').classList.add('d-none');
    document.getElementById('reveal').classList.remove('d-none');
    document.getElementById('reveal').disabled = false;
    document.getElementById('answer-feedback').classList.add('d-none');
    document.getElementById('next').disabled = false;
  }

  revealNextAnswer (data) {
    super.revealNextAnswer(data);
    document.getElementById('next').textContent = 'Next';
    document.getElementById('answer-feedback').classList.remove('d-none');
    this.feedback(this.room.pointsPerPart[0] === 10);
  }

  toggleCorrect ({ correct }) { this.feedback(correct); }
  toggleBonusPart (data) { super.toggleBonusPart(data); this.feedback(data.correct); }
  feedback (correct) {
    document.getElementById('correctness-label').textContent = correct ? 'right' : 'wrong';
    document.getElementById('toggle-correctness').textContent = correct ? 'I was wrong' : 'I was right';
  }

  clearStats () { this.updateStats(); }
  setDifficulties () {}
  updateStats () {
    const player = this.room.players[this.USER_ID];
    document.getElementById('tossup-statline').textContent = player.tens + ' correct, ' + player.negs + ' interrupts (' + player.points + ' points)';
    const stats = this.room.teams[player.teamId].bonusStats;
    document.getElementById('bonus-statline').textContent = (stats[10] ?? 0) + ' bonuses correct';
  }
}
