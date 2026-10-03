import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PDFTOTEXT_PATHS = ['pdftotext', '/opt/homebrew/bin/pdftotext', '/usr/bin/pdftotext', '/usr/local/bin/pdftotext'];

async function runPdftotext (pdfPath, mode) {
  for (const bin of PDFTOTEXT_PATHS) {
    try {
      const args = mode === 'bbox' ? ['-bbox-layout', pdfPath, '-'] : ['-layout', pdfPath, '-'];
      const { stdout } = await execFileAsync(bin, args, { maxBuffer: 30 * 1024 * 1024 });
      return mode === 'bbox' ? reconstructBboxText(stdout) : stdout;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  throw new Error('pdftotext not found - install Poppler (brew install poppler)');
}

const CATEGORY_MAP = {
  'EARTH SCIENCE': 'Earth and Space',
  'EARTH AND SPACE': 'Earth and Space',
  ASTRONOMY: 'Earth and Space',
  'GENERAL SCIENCE': 'General Science',
  PHYSICS: 'Physics',
  CHEMISTRY: 'Chemistry',
  BIOLOGY: 'Biology',
  MATH: 'Math',
  MATHEMATICS: 'Math',
  ENERGY: 'Energy'
};

function mapCategory (raw) {
  const upper = raw.trim().toUpperCase();
  return CATEGORY_MAP[upper] ?? raw.trim();
}

function decodeXmlText (value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([\da-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)));
}

function readWords (pageXml) {
  const words = [];
  const wordPattern = /<word\b([^>]*)>([\s\S]*?)<\/word>/gi;
  let match;
  while ((match = wordPattern.exec(pageXml))) {
    const attrs = match[1];
    const get = name => Number(attrs.match(new RegExp(`\\b${name}="([\\d.]+)"`))?.[1]);
    const word = decodeXmlText(match[2]).trim();
    if (!word) continue;
    words.push({ xMin: get('xMin'), xMax: get('xMax'), yMin: get('yMin'), yMax: get('yMax'), text: word });
  }
  return words;
}

function restoreMath (words) {
  const removed = new Set();
  const fractions = [];
  const isNumber = word => /^\d+(?:\.\d+)?$/.test(word.text);
  for (let i = 0; i < words.length; i++) {
    const top = words[i];
    if (removed.has(i) || !isNumber(top)) continue;
    let pair = null;
    for (let j = 0; j < words.length; j++) {
      const bottom = words[j];
      const verticalGap = bottom.yMin - top.yMin;
      if (j === i || removed.has(j) || !isNumber(bottom) || verticalGap < 14 || verticalGap > 24 || Math.abs(top.xMin - bottom.xMin) > 1.5) continue;
      if (!pair || verticalGap < pair.verticalGap) pair = { index: j, word: bottom, verticalGap };
    }
    if (pair) {
      removed.add(i);
      removed.add(pair.index);
      fractions.push({
        xMin: Math.min(top.xMin, pair.word.xMin),
        xMax: Math.max(top.xMax, pair.word.xMax),
        yMin: (top.yMin + pair.word.yMin) / 2,
        yMax: (top.yMax + pair.word.yMax) / 2,
        text: `<span class="nsb-fraction"><span>${top.text}</span><span>${pair.word.text}</span></span>`
      });
    }
  }
  const combined = [...words.filter((_, index) => !removed.has(index)), ...fractions];
  const attached = new Set();
  for (let i = 0; i < combined.length; i++) {
    const small = combined[i];
    if (attached.has(i) || !/^\d+$/.test(small.text) || small.yMax - small.yMin > 9) continue;
    let nearest = null;
    for (let j = 0; j < combined.length; j++) {
      const base = combined[j];
      if (j === i || attached.has(j) || Math.abs(base.xMax - small.xMin) > 2.5) continue;
      const shift = small.yMin - base.yMin;
      if (Math.abs(shift) < 2 || Math.abs(shift) > 10) continue;
      if (!nearest || Math.abs(shift) < Math.abs(nearest.shift)) nearest = { index: j, shift };
    }
    if (nearest) {
      const base = combined[nearest.index];
      const tag = nearest.shift < 0 ? 'sup' : 'sub';
      base.text += `<${tag}>${small.text}</${tag}>`;
      attached.add(i);
    }
  }
  return combined.filter((_, index) => !attached.has(index));
}

function reconstructBboxText (xml) {
  const pages = [];
  const pagePattern = /<page\b[^>]*>([\s\S]*?)<\/page>/gi;
  let pageMatch;
  while ((pageMatch = pagePattern.exec(xml))) {
    const words = restoreMath(readWords(pageMatch[1]));
    const lines = [];
    for (const word of words.sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin)) {
      let line = lines.find(candidate => Math.abs(candidate.yMin - word.yMin) < 1.5);
      if (!line) {
        line = { yMin: word.yMin, words: [] };
        lines.push(line);
      }
      line.words.push(word);
    }
    const orderedLines = lines.sort((a, b) => a.yMin - b.yMin);
    let previousY = null;
    const pageText = [];
    for (const line of orderedLines) {
      if (previousY !== null && line.yMin - previousY > 20) pageText.push('');
      pageText.push(line.words.sort((a, b) => a.xMin - b.xMin).map(word => word.text).join(' '));
      previousY = line.yMin;
    }
    pages.push(pageText.join('\n'));
  }
  return pages.join('\n\f\n');
}

const TOSSUP_HEADER = /^\s*TOSS[ -]UP\s*$/i;
const BONUS_HEADER = /^\s*BONUS\s*$/i;
const QUESTION_START = /^\s*(\d+)[.)]\s+(.+?)\s*[–—-]?\s*(Short(?: Answer)?|Mu(?:lt|l)iple Choice)\s*(.*)?$/i;
const MC_OPTION = /^([WXYZ])\)\s*(.*)$/i;
const ANSWER_LINE = /^\s*ANSWER\s*[:.]?\s*(.*)$/i;
const PAGE_FOOTER = /^(?:.*\bPage\s+\d+\s*)$/i;
const SEPARATOR = /^\s*[*_~=-]{10,}\s*$/;
const SOLUTION = /^\s*\(Solution:\s*(.*)$/i;

function stripNoise (line) {
  const t = line.trim();
  if (!t || PAGE_FOOTER.test(t) || SEPARATOR.test(t)) return null;
  return t;
}

function cleanInline (parts) {
  return escapeRichText(parts.join(' ').replace(/\s+/g, ' ').trim());
}

function escapeRichText (value) {
  const allowedMathTags = /(<\/?(?:sup|sub|br)>|<span class="nsb-fraction">|<\/span>)/gi;
  const isAllowedMathTag = /^<\/?(?:sup|sub|br)>$|^<span class="nsb-fraction">$|^<\/span>$/i;
  return value.split(allowedMathTags).map(part => isAllowedMathTag.test(part)
    ? part
    : part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('');
}

function parseText (text) {
  const tossups = [];
  const bonuses = [];
  const errors = [];
  const warnings = [];
  let section = null;
  let lastSection = 'BONUS';
  let current = null;
  let hasExplicitSection = false;

  function finish (lineNumber) {
    if (!current) return;
    const errorCountBeforeQuestion = errors.length;
    const stem = cleanInline(current.questionParts);
    const orderedOptionParts = current.optionParts.length === 4 && new Set(current.optionParts.map(option => option.label)).size === 4
      ? [...current.optionParts].sort((a, b) => 'WXYZ'.indexOf(a.label) - 'WXYZ'.indexOf(b.label))
      : current.optionParts;
    const options = orderedOptionParts.map(option => `${option.label}) ${cleanInline(option.parts)}`);
    const question = options.length
      ? `${stem}<br>${options.join('<br>')}`
      : stem;
    let answer = cleanInline(current.answerParts);
    if (!stem) errors.push(`Question ${current.number} at line ${current.lineNumber} has no question text`);
    if (!answer) errors.push(`Question ${current.number} at line ${current.lineNumber} has no answer before line ${lineNumber}`);
    if (current.type.toLowerCase() === 'multiple choice') {
      const labels = options.map(option => option.slice(0, 1).toUpperCase());
      if (labels.join('') !== 'WXYZ') {
        errors.push(`Multiple-choice question ${current.number} at line ${current.lineNumber} has options ${labels.join(',') || '(none)'}`);
      }
      const answerChoice = answer.match(/^([WXYZ])(?:\)\s*(.*))?$/i);
      if (answerChoice) {
        const label = answerChoice[1].toUpperCase();
        const option = orderedOptionParts.find(candidate => candidate.label === label);
        if (!option) {
          errors.push(`Multiple-choice answer ${label} for question ${current.number} has no matching option`);
        } else if (!answerChoice[2]?.trim()) {
          answer = `${label}) ${cleanInline(option.parts)}`;
        }
      }
    }
    if (stem) {
      const item = {
        number: current.number,
        question,
        answer,
        category: mapCategory(current.category),
        type: current.type,
        options: options.map(option => option.replace(/^([WXYZ])\)\s*/, '$1) ')),
        notes: current.notes,
        validationErrors: errors.slice(errorCountBeforeQuestion)
      };
      (current.section === 'TOSS-UP' ? tossups : bonuses).push(item);
      lastSection = current.section;
    }
    current = null;
  }

  for (const [index, rawLine] of text.split('\n').entries()) {
    const lineNumber = index + 1;
    const t = stripNoise(rawLine);
    if (t === null) continue;

    if (TOSSUP_HEADER.test(t) || BONUS_HEADER.test(t)) {
      finish(lineNumber);
      section = TOSSUP_HEADER.test(t) ? 'TOSS-UP' : 'BONUS';
      hasExplicitSection = true;
      continue;
    }

    const start = QUESTION_START.exec(rawLine);
    if (start) {
      finish(lineNumber);
      if (!section) {
        section = lastSection === 'BONUS' ? 'TOSS-UP' : 'BONUS';
        warnings.push(`Question ${start[1]} at line ${lineNumber} has no explicit toss-up/bonus heading; inferred ${section}`);
      }
      current = {
        number: Number(start[1]),
        category: start[2].trim(),
        type: /^short/i.test(start[3]) ? 'Short Answer' : 'Multiple Choice',
        section,
        lineNumber,
        questionParts: start[4] ? [start[4].trim()] : [],
        optionParts: [],
        answerParts: [],
        notes: []
      };
      continue;
    }

    if (!current) continue;
    const answer = ANSWER_LINE.exec(t);
    if (answer) {
      current.answerParts.push(answer[1]);
      continue;
    }
    const solution = SOLUTION.exec(t);
    if (solution) {
      current.notes.push(t);
      continue;
    }
    if (current.answerParts.length) {
      current.answerParts.push(t);
      continue;
    }
    const option = MC_OPTION.exec(t);
    if (option) {
      current.optionParts.push({ label: option[1].toUpperCase(), parts: [option[2]] });
    } else if (current.optionParts.length) {
      current.optionParts[current.optionParts.length - 1].parts.push(t);
    } else {
      current.questionParts.push(t);
    }
  }
  finish(text.split('\n').length + 1);

  for (const [sectionName, questions] of [['toss-up', tossups], ['bonus', bonuses]]) {
    const counts = new Map();
    for (const item of questions) counts.set(item.number, (counts.get(item.number) ?? 0) + 1);
    for (const [number, count] of counts) if (count !== 1) errors.push(`Question number ${number} appears ${count} times in ${sectionName} section`);
  }
  if (!tossups.length && !bonuses.length) errors.push('No questions were parsed');

  return {
    tossups,
    bonuses,
    diagnostics: { errors, warnings, explicitSectionHeadings: hasExplicitSection }
  };
}

function buildTossup (item) {
  return { number: item.number, question: item.question, answer: item.answer, category: item.category, type: item.type, options: item.options, notes: item.notes };
}

function buildBonus (item) {
  return {
    number: item.number,
    leadin: '',
    parts: [item.question],
    answers: [item.answer],
    category: item.category,
    values: [10],
    type: item.type,
    options: item.options,
    notes: item.notes
  };
}

export async function parseNsbPdf (pdfPath) {
  const [layoutText, bboxText] = await Promise.all([
    runPdftotext(pdfPath, 'layout'),
    runPdftotext(pdfPath, 'bbox')
  ]);
  const layoutParsed = parseText(layoutText);
  const bboxParsed = parseText(bboxText);
  const score = parsed => Math.min(parsed.tossups.length, parsed.bonuses.length) * 100 + parsed.tossups.length + parsed.bonuses.length - parsed.diagnostics.errors.length * 0.1;
  const parsed = score(bboxParsed) >= score(layoutParsed) ? bboxParsed : layoutParsed;
  return {
    tossups: parsed.tossups.map(buildTossup),
    bonuses: parsed.bonuses.map(buildBonus),
    diagnostics: parsed.diagnostics
  };
}

export { parseText, mapCategory, reconstructBboxText, escapeRichText };
