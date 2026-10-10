import fs from 'node:fs';
import applyNsbStructuralCorrections from './apply-nsb-structural-corrections.js';

const corrections = JSON.parse(fs.readFileSync(new URL('./nsb-question-corrections.json', import.meta.url), 'utf8'));

/**
 * Applies exact, source-keyed corrections to extracted NSB packet data.
 * @param {string} sourceUrl
 * @param {{tossups: Object[], bonuses: Object[]}} packet
 * @returns {{tossups: Object[], bonuses: Object[]}}
 */
export function applyNsbQuestionCorrections (sourceUrl, packet) {
  packet = applyNsbStructuralCorrections(sourceUrl, packet);
  const correction = corrections[sourceUrl];
  if (!correction) return packet;

  return {
    tossups: applyCorrections(packet.tossups, correction.tossups),
    bonuses: applyCorrections(packet.bonuses, correction.bonuses)
  };
}

function applyCorrections (items, correctionsByNumber = {}) {
  return items.map(item => {
    const correction = correctionsByNumber[item.number];
    return correction ? { ...item, ...correction } : item;
  });
}
