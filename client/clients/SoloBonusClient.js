import { MODE_ENUM } from '../../shared/constants.js';
import questionStats from '../scripts/auth/question-stats.js';
import BonusClient from './BonusClient.js';

const modeVersion = '2025-01-14';
const queryVersion = '2025-05-07';
const settingsVersion = 'nsb-single-bonus';

export default class SoloBonusClient extends BonusClient {
  onmessage (message) {
    const data = JSON.parse(message);
    switch (data.type) {
      case 'toggle-type-to-answer': return this.toggleTypeToAnswer(data);
      default: return super.onmessage(message);
    }
  }

  clearStats ({ teamId }) {
    this.updateStatDisplay({ 0: 0, 10: 0, 20: 0, 30: 0 });
  }

  endCurrentBonus ({ bonus, lastPartRevealed, pointsPerPart, starred, stats }) {
    super.endCurrentBonus({ bonus, starred });
    this.updateStatDisplay(stats);
    if (lastPartRevealed && (this.room.mode !== MODE_ENUM.LOCAL)) {
      questionStats.recordBonus({ _id: bonus._id, pointsPerPart, multiplayer: false });
    }
  }

  setCategories ({ alternateSubcategories, categories, subcategories, percentView, categoryPercents }) {
    super.setCategories();
    window.localStorage.setItem('singleplayer-bonus-query', JSON.stringify({ ...this.room.query, version: queryVersion }));
  }

  setDifficulties ({ difficulties }) {
    window.localStorage.setItem('singleplayer-bonus-query', JSON.stringify({ ...this.room.query, version: queryVersion }));
  }

  setMaxYear ({ maxYear }) {
    super.setMaxYear({ maxYear });
    window.localStorage.setItem('singleplayer-bonus-query', JSON.stringify({ ...this.room.query, version: queryVersion }));
  }

  setMinYear ({ minYear }) {
    super.setMinYear({ minYear });
    window.localStorage.setItem('singleplayer-bonus-query', JSON.stringify({ ...this.room.query, version: queryVersion }));
  }

  setMode ({ mode }) {
    switch (mode) {
      case MODE_ENUM.SET_NAME:
        document.getElementById('local-packet-settings').classList.add('d-none');
        break;
      case MODE_ENUM.RANDOM:
        document.getElementById('local-packet-settings').classList.add('d-none');
        break;
      case MODE_ENUM.STARRED:
        document.getElementById('difficulty-settings').classList.add('d-none');
        document.getElementById('local-packet-settings').classList.add('d-none');
        document.getElementById('set-settings').classList.add('d-none');
        document.getElementById('toggle-standard-only').disabled = true;
        document.getElementById('toggle-three-part-bonuses').disabled = true;
        break;
      case MODE_ENUM.LOCAL:
        document.getElementById('difficulty-settings').classList.add('d-none');
        document.getElementById('local-packet-settings').classList.remove('d-none');
        document.getElementById('set-settings').classList.add('d-none');
        document.getElementById('toggle-standard-only').disabled = true;
        document.getElementById('toggle-three-part-bonuses').disabled = true;
        break;
    }
    super.setMode({ mode });
    window.localStorage.setItem('singleplayer-bonus-mode', JSON.stringify({ mode, version: modeVersion }));
  }

  setPacketNumbers ({ packetNumbers }) {
    super.setPacketNumbers({ packetNumbers });
    window.localStorage.setItem('singleplayer-bonus-query', JSON.stringify({ ...this.room.query, version: queryVersion }));
  }

  async setSetName ({ setName, setLength }) {
    super.setSetName({ setName, setLength });
    window.localStorage.setItem('singleplayer-bonus-query', JSON.stringify({ ...this.room.query, version: queryVersion }));
  }

  setStrictness ({ strictness }) {
    super.setStrictness({ strictness });
    window.localStorage.setItem('singleplayer-bonus-settings', JSON.stringify({ ...this.room.settings, version: settingsVersion }));
  }

  startNextBonus ({ bonus, packetLength }) {
    super.startNextBonus({ packetLength, bonus });
    document.getElementById('next').disabled = false;
  }

  toggleStandardOnly ({ standardOnly }) {
    super.toggleStandardOnly({ standardOnly });
    window.localStorage.setItem('singleplayer-bonus-query', JSON.stringify({ ...this.room.query, version: queryVersion }));
  }

  toggleThreePartBonuses ({ threePartBonuses }) {
    super.toggleThreePartBonuses({ threePartBonuses });
    window.localStorage.setItem('singleplayer-bonus-query', JSON.stringify({ ...this.room.query, version: queryVersion }));
  }

  toggleTimer ({ timer }) {
    super.toggleTimer({ timer });
    window.localStorage.setItem('singleplayer-bonus-settings', JSON.stringify({ ...this.room.settings, version: settingsVersion }));
  }

  toggleReadBonusesLikeTossups ({ readBonusLikeATossup }) {
    super.toggleReadBonusesLikeTossups({ readBonusLikeATossup });
    window.localStorage.setItem('singleplayer-bonus-settings', JSON.stringify({ ...this.room.settings, version: settingsVersion }));
  }

  setReadingSpeed ({ readingSpeed }) {
    super.setReadingSpeed({ readingSpeed });
    window.localStorage.setItem('singleplayer-bonus-settings', JSON.stringify({ ...this.room.settings, version: settingsVersion }));
  }

  toggleTypeToAnswer ({ typeToAnswer }) {
    document.getElementById('type-to-answer').checked = typeToAnswer;
    window.localStorage.setItem('singleplayer-bonus-settings', JSON.stringify({ ...this.room.settings, version: settingsVersion }));
  }

  /**
 * Calculates the points per bonus and updates the display.
 */
  updateStatDisplay (stats) {
    const numBonuses = stats[0] + stats[10];
    const points = 10 * stats[10];
    const includePlural = (numBonuses === 1) ? '' : 'es';
    document.getElementById('statline').textContent = `${stats[10]} correct with ${numBonuses} bonus${includePlural} seen (${points} pts)`;
  }
}
