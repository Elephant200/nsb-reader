/**
 * Removes source reading aids from grading keys while retaining chemical groups,
 * coordinates, intervals and ACCEPT/REJECT instructions.
 * @param {string} text
 * @returns {string}
 */
export default function stripAnswerReadingCues (text) {
  return text.replace(/\(read as:\s*[^()]*\)/gi, '').replace(/\[([^[\]]*)\]/g, (bracket, body) => {
    const cue = body.trim();
    if (/^NOTE\s*:/i.test(cue)) return '';
    if (/^(?:the (?:absolute value|quantity)|[a-z] of [a-z] equals|square root of)\b/i.test(cue)) return '';
    if (/^(?:s-p-\d+(?:-d-\d+)?|pie|wimps|TWO)$/i.test(cue) || cue === 'Oh') return '';
    if (/^[a-z]+(?:-[a-z]+)+$/i.test(cue) && cue.split('-').some(syllable => syllable.length >= 3)) return '';
    return bracket;
  }).replace(/\s+/g, ' ').trim();
}
