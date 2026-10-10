const MATH_NOTATION = /[\p{N}\p{Sm}⁺⁻₊₋ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓᵦᵧᵨᵩᵪ=<>+−–×÷*/⁄∕√∛∜∑∫≤≥≠±∞%°·⋅′″‴^_α-ωΑ-Ω\u2190-\u21ff]|\\(?:frac|sqrt|ce)\b/u;
const MATH_WORD = /^(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|first|second|thirds?|fourths?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?|half|halves|quarters?|squared|cubed|equals?|plus|minus|times|divided|multiplied|numerator|denominator|fraction|root|radical|raised|exponent|power|sine|cosine|tangent|logarithm|sin|cos|tan|cot|sec|csc|log|ln)$/i;

function isMathWord (word = '') {
  return MATH_NOTATION.test(word) || MATH_WORD.test(word.replace(/^[([{]+|[.,;:!?)}\]]+$/g, '')) || /^[*/−-]$/.test(word);
}

/**
 * Delay after a progressively revealed word, in milliseconds. Equation notation
 * and number/operator words receive at least twice the prose delay, with
 * a minimum reading weight for short symbols. Single-letter variables inherit
 * equation timing from adjacent notation. Pure data keeps solo and MP in sync.
 * @param {string[]} words
 * @param {number} index
 * @param {number} readingSpeed
 * @param {{skipPowerMarkers?: boolean}} [options]
 * @returns {number}
 */
export function readingWordDelay (words, index, readingSpeed, { skipPowerMarkers = false } = {}) {
  const word = words[index];
  if (skipPowerMarkers && ['(*)', '[*]', '(+)'].includes(word)) return 0;

  let weight = Math.log(Math.max(1, word.length)) + 1;
  if ((word.endsWith('.') && /[a-z]/.test(word.at(-2) ?? '')) || /[.!?]”$/.test(word)) {
    weight += 2.5;
  } else if (/,”?$/.test(word)) {
    weight += 1.5;
  }

  const variable = /^[([{]*[a-z][.,;:!?)}\]]*$/i.test(word) &&
    (isMathWord(words[index - 1]) || isMathWord(words[index + 1]));
  if (isMathWord(word) || variable) weight = Math.max(weight, 2.5) * 2;

  return weight * 0.9 * (140 - readingSpeed);
}
