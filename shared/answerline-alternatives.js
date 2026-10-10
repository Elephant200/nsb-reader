/**
 * Extracts explicit NSB instructions without treating mathematical parentheses
 * or chemical square brackets as editorial annotations.
 * @param {string} text
 * @param {{splitMain?: boolean}} [options]
 * @returns {{accept: string[], reject: string[], prompt: string[]}}
 */
export default function answerlineAlternatives (text, { splitMain = true } = {}) {
  const result = { accept: [], reject: [], prompt: [] };
  let main = '';
  for (let i = 0; i < text.length; i++) {
    const opener = text[i];
    const header = (opener === '(' || opener === '[') && text.slice(i + 1).match(/^\s*(DO NOT ACCEPT|ALSO ACCEPT|ACCEPT|REJECT|PROMPT(?: ON)?)\s*:?\s*/i);
    if (!header) { main += opener; continue; }
    const stack = [opener];
    let end = i + 1;
    for (; end < text.length && stack.length; end++) {
      if ('(['.includes(text[end])) stack.push(text[end]);
      else if (text[end] === (stack.at(-1) === '(' ? ')' : ']')) stack.pop();
    }
    if (stack.length) { main += text.slice(i); break; }
    const body = text.slice(i + 1 + header[0].length, end - 1);
    // A local synonym still needs a following coordinate or other qualifier.
    // Example: RELATIVE MINIMUM (ACCEPT: MINIMUM) AT (0, 1).
    const qualifier = text.slice(end).match(/^\s+(?:AT|FOR|WITH|WHEN)\b.*?(?=\s*[[(](?:ACCEPT|DO NOT ACCEPT|REJECT|PROMPT|NOTE)\b|$)/i)?.[0]?.trim();
    let directive = header[1];
    let start = 0;
    let depth = 0;
    const append = value => {
      const target = /DO NOT|REJECT/i.test(directive) ? 'reject' : /PROMPT/i.test(directive) ? 'prompt' : 'accept';
      result[target].push(value.trim() + (target === 'accept' && qualifier ? ' ' + qualifier : ''));
    };
    for (let j = 0; j < body.length; j++) {
      if ('(['.includes(body[j])) depth++;
      else if (')]'.includes(body[j])) depth--;
      const next = depth === 0 && body.slice(j).match(/^[;,]\s*(DO NOT ACCEPT|ALSO ACCEPT|ACCEPT|REJECT|PROMPT(?: ON)?)\s*:?\s*/i);
      if (!next) continue;
      append(body.slice(start, j));
      directive = next[1];
      j += next[0].length - 1;
      start = j + 1;
    }
    append(body.slice(start));
    i = end - 1;
  }
  for (const directive of Object.keys(result)) {
    result[directive] = result[directive].flatMap(splitAlternatives).filter(Boolean);
  }
  result.accept.unshift(...(splitMain ? splitAlternatives(main.trim()) : [main.trim()]).filter(Boolean));
  return result;
}

function splitAlternatives (text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if ('(['.includes(text[i])) depth++;
    else if (')]'.includes(text[i])) depth--;
    const separator = depth === 0 && text.slice(i).match(/^\s+OR\s+/i);
    if (separator) {
      parts.push(text.slice(start, i).trim());
      i += separator[0].length - 1;
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}
