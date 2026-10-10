import answerlineAlternatives from './answerline-alternatives.js';
import { scienceText, scienceKey, scalarValue } from './normalize-science-answer.js';
import splitAnswerList, { numberedAnswerList } from './split-answer-list.js';
import stripAnswerReadingCues from './strip-answer-reading-cues.js';

const ELEMENTS = new Set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' '));

function structured (text) {
  if (/[\d^_=+*/<>≤≥≠√π°]|^\p{L}$/u.test(text) || /\b[a-z]\s*-\s*[a-z]\b|[a-z]\([^)]*\)|^-\s*[a-z]$|\b(?:sin|cos|tan|log|ln)\b/i.test(text)) return true;
  const atoms = text.match(/[A-Z][a-z]?/g);
  return !!atoms && atoms.join('') === text && atoms.every(atom => ELEMENTS.has(atom)) && (text.length <= 2 || /[a-z]/.test(text));
}

function equivalent (answer, given, allowScalar = true) {
  if (!balanced(answer) || !balanced(given)) return false;
  if ([answer, given].some(value => /\^\s*(?:\^|$)|\/\s*(?:\/|$)|\^\(\s*\)/.test(value))) return false;
  const a = scalarValue(answer);
  const b = scalarValue(given);
  if (allowScalar && a && b) return a[0] * b[1] === b[0] * a[1];
  const withUnit = value => {
    const match = value.match(/^(.+?)\s+([a-zµμΩ°].*)$/i);
    const scalar = match && scalarValue(match[1]);
    return scalar ? { scalar, unit: scienceKey(match[2]) } : null;
  };
  const answerUnit = allowScalar && withUnit(answer);
  const givenUnit = allowScalar && withUnit(given);
  if (answerUnit && givenUnit) return answerUnit.unit === givenUnit.unit && answerUnit.scalar[0] * givenUnit.scalar[1] === givenUnit.scalar[0] * answerUnit.scalar[1];
  const key = scienceKey(answer);
  const response = scienceKey(given);
  return structured(answer) ? key === response : key.toLocaleLowerCase() === response.toLocaleLowerCase();
}

function balanced (text) {
  // Half-open intervals deliberately use different opening and closing marks.
  const intervals = text.replace(/(^|[∪∩]\s*)[[(][^()[\],]+,[^()[\],]+[)\]](?=\s*(?:[∪∩]|$))/g, '$1interval');
  const stack = [];
  for (const char of intervals) {
    if ('(['.includes(char)) stack.push(char);
    else if (')]'.includes(char) && stack.pop() !== (char === ')' ? '(' : '[')) return false;
  }
  return stack.length === 0;
}

/**
 * Keeps prose answer checking while comparing scientific notation structurally.
 * @param {Function} checkShortAnswer Prose checker shared by browser and server.
 * @returns {Function} Checker accepting answerline, response, strictness and prompt.
 */
export function createNsbAnswerChecker (checkShortAnswer) {
  return function checkAnswer (answerline, givenAnswer, strictness = 7, question = '') {
    const reject = { directive: 'reject', directedPrompt: null };
    if (typeof answerline !== 'string' || typeof givenAnswer !== 'string' || answerline.length > 5000 || givenAnswer.length > 5000) return reject;
    const answer = scienceText(stripAnswerReadingCues(answerline));
    const given = scienceText(givenAnswer);
    if (!answer || !given) return reject;
    const choice = answer.match(/^([WXYZ])\)\s*(.*)$/i);
    if (!choice) {
      const requireAll = /[([]must give (?:both|all) answers?[)\]]/i.test(answer);
      const countInstruction = answer.match(/^[([]ACCEPT (?:ANY )?(TWO|THREE|FOUR|2|3|4)[)\]]\s*/i);
      const explicitOrder = /[([](?:in this order|answers must be in this order)[)\]]/i.test(answer);
      const anyOrder = !explicitOrder && (requireAll || /[([](?:in )?(?:any|either) order[)\]]/i.test(answer));
      const key = answer.replace(/^[([]ACCEPT (?:ANY )?(?:TWO|THREE|FOUR|2|3|4)[)\]]\s*/i, '').replace(/[([](?:(?:in )?(?:any|either|this) order|answers must be in this order|must give (?:both|all) answers?|must give at least one|must give units|must give negative value)[)\]]/gi, '').trim();
      const numbered = numberedAnswerList(key);
      const components = numbered?.map(entry => entry.value) ?? splitAnswerList(key, requireAll);
      // An acceptance note before another component applies to its own component.
      // Removing all notes first would incorrectly accept one component by itself.
      const localAlternatives = components.length > 1 && components.slice(0, -1).some(component => /[([]\s*(?:ALSO )?ACCEPT\b/i.test(component));
      if (numbered || localAlternatives) {
        const labelledResponse = numberedAnswerList(given);
        if (labelledResponse && numbered && (labelledResponse.length !== numbered.length || labelledResponse.some((entry, i) => entry.label !== numbered[i].label))) return reject;
        const response = labelledResponse?.map(entry => entry.value) ?? splitAnswerList(given, requireAll);
        if (response.length !== components.length) return reject;
        const remaining = [...response];
        const accepted = components.every((component, i) => {
          if (!anyOrder || labelledResponse) return checkAnswer(component, response[i], strictness, question).directive === 'accept';
          const index = remaining.findIndex(value => checkAnswer(component, value, strictness, question).directive === 'accept');
          if (index === -1) return false;
          remaining.splice(index, 1);
          return true;
        });
        return { directive: accepted ? 'accept' : 'reject', directedPrompt: null };
      }
      if (countInstruction) {
        const count = { TWO: 2, THREE: 3, FOUR: 4 }[countInstruction[1].toUpperCase()] || Number(countInstruction[1]);
        const pool = splitAnswerList(key);
        const response = splitAnswerList(given);
        if (response.length !== count) return reject;
        const remaining = [...pool];
        const accepted = response.every(value => {
          const index = remaining.findIndex(candidate => equivalent(candidate, value));
          if (index === -1) return false;
          remaining.splice(index, 1);
          return true;
        });
        return { directive: accepted ? 'accept' : 'reject', directedPrompt: null };
      }
      const alternatives = answerlineAlternatives(key, { splitMain: !requireAll });
      const primary = answerlineAlternatives(key, { splitMain: false }).accept[0] || '';
      const expectsList = !scalarValue(primary) && splitAnswerList(primary, requireAll).length > 1;
      const expectsTuple = /^[[(][^()[\]]*,[^()[\]]*[)\]]$/.test(primary);
      // A single answer may have comma-separated accepted synonyms or formulas.
      // A required list's accepted wording must remain a complete list instead.
      if (!expectsList && !expectsTuple && !requireAll) alternatives.accept = alternatives.accept.flatMap(candidate => scalarValue(candidate) && !/[,;]\s/.test(candidate) ? [candidate] : splitAnswerList(candidate, false, false));
      // Explicit rejected forms can distinguish numerically equal responses
      // (e.g. +5 but not 5, or a required scientific-notation coefficient).
      const allowScalar = !alternatives.reject.some(structured);
      const matches = candidate => {
        const scientific = value => /(?:\*|x)\s*10\^|(?:\d|\.)[eE][+-]?\d/.test(value);
        if (/\bin scientific notation\b/i.test(question) && scalarValue(candidate) && scientific(candidate) && !scientific(given)) return false;
        // Commas in scalar thousands separators are not list delimiters.
        const list = scalarValue(candidate) ? [candidate] : splitAnswerList(candidate, requireAll);
        if (list.length < 2) return equivalent(candidate, given, allowScalar);
        const response = splitAnswerList(given, requireAll);
        if (list.length !== response.length) return false;
        if (!anyOrder) return list.every((item, i) => equivalent(item, response[i], allowScalar));
        const remaining = [...response];
        return list.every(item => {
          const index = remaining.findIndex(value => equivalent(item, value, allowScalar));
          if (index === -1) return false;
          remaining.splice(index, 1);
          return true;
        });
      };
      for (const directive of ['reject', 'accept', 'prompt']) {
        if (alternatives[directive].some(matches)) return { directive, directedPrompt: null };
      }
      if (!Object.values(alternatives).flat().some(structured) && !expectsList && !requireAll) return checkShortAnswer(answerline, givenAnswer, strictness);
      return reject;
    }

    const letter = choice[1].toUpperCase();
    const alternatives = answerlineAlternatives(choice[2], { splitMain: false });
    const displayed = scienceText(question).match(new RegExp(`(?:^|\\s)${letter}\\)\\s*(.*?)(?=\\s[WXYZ]\\)|$)`, 'i'));
    const accepted = [...alternatives.accept, displayed?.[1]].filter(Boolean).map(stripAnswerReadingCues);
    const letterOnly = given.match(/^([WXYZ])(?:[).])?$/i);
    if (letterOnly) return { directive: letterOnly[1].toUpperCase() === letter ? 'accept' : 'reject', directedPrompt: null };
    // An entire option can begin with a variable or a list such as Z, W+, W−.
    // Compare it before interpreting an ambiguous leading letter as a label.
    if (alternatives.reject.some(candidate => equivalent(candidate, given))) return reject;
    if (accepted.some(candidate => equivalent(candidate, given))) return { directive: 'accept', directedPrompt: null };
    // A leading variable in an equation is not a multiple-choice label.
    const combined = given.match(/^([WXYZ])(?:[).,:]\s*|\s+(?![\s=+*/^_<>≤≥≠-]))(.+)$/i);
    if (combined && combined[1].toUpperCase() !== letter) return reject;
    const response = combined ? combined[2] : given;
    if (alternatives.reject.some(candidate => equivalent(candidate, response))) return reject;
    return { directive: accepted.some(candidate => equivalent(candidate, response)) ? 'accept' : 'reject', directedPrompt: null };
  };
}
