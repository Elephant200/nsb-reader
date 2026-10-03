function plain (value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .normalize('NFKC').replace(/[−–]/g, '-').replace(/[⁄∕]/g, '/').replace(/\s+/g, ' ').trim();
}

export function createNsbAnswerChecker (checkShortAnswer) {
  return function checkAnswer (answerline, givenAnswer, strictness = 7, question = '') {
    const answer = plain(answerline);
    const given = plain(givenAnswer);
    const reject = { directive: 'reject', directedPrompt: null };
    if (!answer || !given) return reject;
    const choice = answer.match(/^([WXYZ])\)\s*(.*)$/i);
    if (!choice) {
      // Fuzzy word matching must not accept a fraction's numerator as its answer.
      const numeric = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*\/\s*[+-]?\d+(?:\.\d+)?)?$/;
      if (numeric.test(answer)) {
        const normalizeNumber = value => value.replace(/\s/g, '').replace(/^\+/, '');
        return { directive: normalizeNumber(answer) === normalizeNumber(given) ? 'accept' : 'reject', directedPrompt: null };
      }
      return checkShortAnswer(answerline, givenAnswer, strictness);
    }

    const letter = choice[1].toUpperCase();
    const text = choice[2].replace(/\s*\((?:ACCEPT|DO NOT ACCEPT|ALSO ACCEPT)[\s\S]*$/i, '').trim();
    const choices = plain(question).match(new RegExp(`(?:^|\\s)${letter}\\)\\s*(.*?)(?=\\s[WXYZ]\\)|$)`, 'i'));
    const acceptedTexts = [text, choices?.[1]].filter(Boolean).map(value => value.toLocaleLowerCase());
    const letterOnly = given.match(/^([WXYZ])(?:[).])?$/i);
    let correct;
    if (letterOnly) {
      correct = letterOnly[1].toUpperCase() === letter;
    } else {
      const combined = given.match(/^([WXYZ])(?:[).,:-]\s*|\s+)(.+)$/i);
      const responseText = combined ? combined[2] : given;
      // Choice text is exact except for capitalization and whitespace.
      correct = (!combined || combined[1].toUpperCase() === letter) &&
        acceptedTexts.includes(responseText.toLocaleLowerCase());
    }
    return { directive: correct ? 'accept' : 'reject', directedPrompt: null };
  };
}
