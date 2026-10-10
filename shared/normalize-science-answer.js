const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ';
const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓᵦᵧᵨᵩᵪ';
const SUPER_PATTERN = new RegExp(`[${SUPERSCRIPTS}]+`, 'g');
const SUB_PATTERN = new RegExp(`[${SUBSCRIPTS}]+`, 'g');
const FRACTIONS = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };
const ENTITIES = { amp: '&', lt: '<', gt: '>', nbsp: ' ', quot: '"', apos: "'", minus: '−', times: '×', middot: '·', pi: 'π', radic: '√', le: '≤', ge: '≥', ne: '≠', deg: '°' };

/**
 * Converts display notation to explicit, comparable text without erasing powers,
 * signs, fraction grouping, or chemical capitalization. It does not simplify algebra.
 * @param {string} value
 * @returns {string}
 */
export function scienceText (value) {
  let text = String(value ?? '').replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/(\d)<sup>(st|nd|rd|th)<\/sup>(?=\s|[.,;:)]|$)/gi, '$1$2');
  // Resolve innermost fractions and powers before their containing expressions.
  for (let i = 0; i < 20; i++) {
    const previous = text;
    text = text
      .replace(/<span class=["']nsb-fraction["']><span>((?:(?!<\/?span\b)[\s\S])*?)<\/span><span>((?:(?!<\/?span\b)[\s\S])*?)<\/span><\/span>/gi, '(($1)/($2))')
      .replace(/<sup>((?:(?!<\/?sup>)[\s\S])*?)<\/sup>/gi, '^($1)')
      .replace(/<sub>((?:(?!<\/?sub>)[\s\S])*?)<\/sub>/gi, '_($1)');
    if (text === previous) break;
  }
  return text.replace(/<\/?(?:b|u|i|em|strong|span)(?:\s[^<>]*)?>/gi, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, key) => {
      if (!key.startsWith('#')) return ENTITIES[key.toLowerCase()] ?? entity;
      const point = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    })
    .replace(SUPER_PATTERN, run => '^(' + run.normalize('NFKC') + ')')
    .replace(SUB_PATTERN, run => '_(' + run.normalize('NFKC') + ')')
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, char => '(' + FRACTIONS[char] + ')')
    .replace(/[\u{1D400}-\u{1D7FF}]/gu, char => char.normalize('NFKC'))
    .normalize('NFC').replace(/[−–]/g, '-').replace(/[⁄∕]/g, '/')
    .replace(/[×·⋅]/g, '*')
    .replace(/(\d+(?:\.\d+)?)\s*(?:times|x)\s*(?=10\^)/gi, '$1*')
    .replace(/\s+/g, ' ').trim();
}

/** @param {string} value @returns {string} */
export function scienceKey (value) {
  let key = scienceText(value)
    .replace(/^([A-Z][a-z]?)(\d+)([+-])$/, '$1^($2$3)')
    .replace(/^((?:[A-Z][a-z]?\d*)+)([+-])$/, '$1^($2)')
    .replace(/\^\s*(\d+[+-]|[+-])(?=$|\s)/g, '^($1)')
    .replace(/\^\s*([+-]?\d+(?:\.\d+)?|[a-z])/gi, '^($1)')
    .replace(/_\s*(\d+|[a-z])/gi, '_($1)')
    .replace(/_\((\d+)\)/g, '$1')
    .replace(/π/g, 'pi')
    .replace(/√\s*(\d+|[a-z])/gi, 'sqrt($1)')
    .replace(/\s*([=+*/^_(),<>≤≥≠-])\s*/g, '$1')
    .replace(/\b(meters?|metres?|seconds?|grams?|kilograms?|joules?|newtons?|watts?|volts?|amperes?|pascals?|hertz|coulombs?|degrees?|celsius|kelvin|liters?|litres?|moles?|centimeters?|millimeters?|nanometers?|kilometers?|squared|cubed|per)\b/gi, word => word.toLowerCase())
    .replace(/\b(relative|minimum|maximum|at|for|with|when|and|forward|backward|iron|oxygen|gallium|atoms?|ions?|plus|minus|photons?|order)\b/gi, word => word === 'At' ? word : word.toLowerCase())
    .trim();
  // Source answer lines sometimes capitalize orbital hybridization labels.
  // Require the complete label with explicit powers; keep chemical case intact.
  if (key.includes('^') && /^(?:d\^\(\d+\))?sp(?:\^\(\d+\))?(?:d(?:\^\(\d+\))?)?$/i.test(key)) key = key.toLowerCase();
  // Atomic fraction operands may be parenthesized by the rich-text converter.
  // Keep function arguments and composite operands grouped.
  for (let i = 0; i < 20; i++) {
    const previous = key;
    key = key.replace(/(^|[(/+*=,<>-])\(([a-z\d.]+)\)(?=$|[)/+*=,<>-])/gi, '$1$2');
    key = unwrap(key) ?? key;
    if (key === previous) break;
  }
  const equation = key.match(/^([^=]+)=([^=]+)$/);
  if (equation) key = `${unwrap(equation[1]) ?? equation[1]}=${unwrap(equation[2]) ?? equation[2]}`;
  return key;
}

function unwrap (input) {
  while (input.startsWith('(')) {
    let depth = 0;
    let firstClose = -1;
    for (let i = 0; i < input.length; i++) {
      if (input[i] === '(') depth++;
      if (input[i] === ')') depth--;
      if (depth < 0) return null;
      if (depth === 0 && firstClose < 0) firstClose = i;
    }
    if (depth !== 0) return null;
    if (firstClose !== input.length - 1) return input;
    input = input.slice(1, -1);
  }
  return input;
}

/**
 * Parses scalar decimals, fractions and scientific notation as exact rationals.
 * Limits prevent very large user exponents from allocating unbounded BigInts.
 * @param {string} value
 * @returns {[bigint, bigint] | null}
 */
export function scalarValue (value) {
  let text = scienceKey(value);
  if (text.length > 1000) return null;
  const mixed = text.match(/^([+-]?\d+)\s+(.+\/.+)$/);
  if (mixed && mixed[1].length <= 200) {
    const fraction = scalarValue(mixed[2]);
    if (fraction && fraction[0] > 0n && fraction[1] > fraction[0]) {
      const whole = BigInt(mixed[1].replace(/^[+-]/, ''));
      return [(whole * fraction[1] + fraction[0]) * (mixed[1].startsWith('-') ? -1n : 1n), fraction[1]];
    }
    return null;
  }
  if (/[\d.]\s+[\d.]/.test(text)) return null;
  text = text.replace(/\s/g, '');
  if (text.length > 1000 || !/^[\d.eE+*/^(),x-]+$/.test(text)) return null;
  text = unwrap(text);
  if (text === null) return null;
  if (/^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) text = text.replace(/,/g, '');
  const decimal = input => {
    input = unwrap(input);
    if (input === null) return null;
    const match = input.match(/^([+-]?)(\d*(?:\.\d+)?)(?:[eE]([+-]?\d+))?$/);
    if (!match || !/\d/.test(match[2]) || match[2].length > 200) return null;
    const exponent = Number(match[3] || 0);
    if (Math.abs(exponent) > 300) return null;
    const [whole, fraction = ''] = match[2].split('.');
    const scale = fraction.length - exponent;
    let numerator = BigInt((whole || '0') + fraction) * (match[1] === '-' ? -1n : 1n);
    if (scale < 0) numerator *= 10n ** BigInt(-scale);
    return [numerator, scale > 0 ? 10n ** BigInt(scale) : 1n];
  };
  text = text.replace(/(?:\*|x)10\^\(([+-]?\d+)\)$/, 'e$1');
  if (/^[+-]?10\^\([+-]?\d+\)$/.test(text)) text = text.replace(/10\^\(([+-]?\d+)\)/, '1e$1');
  const pieces = text.split('/');
  if (pieces.length > 2) return null;
  const numerator = decimal(pieces[0]);
  if (!numerator) return null;
  if (pieces.length === 1) return numerator;
  const denominator = decimal(pieces[1]);
  if (!denominator || denominator[0] === 0n) return null;
  return [numerator[0] * denominator[1], numerator[1] * denominator[0]];
}
