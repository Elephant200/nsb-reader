/* global Response */
import { RE2JS } from 're2js';

const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Search runs in an Object's CPU budget; its static text index avoids full D1 scans. */
export class QuestionSearch {
  constructor (ctx, env) { this.env = env; }

  async fetch (request) {
    const { options, frequency = false } = await request.json();
    if (!this.index) {
      const asset = await this.env.ASSETS.fetch('https://assets/question-search.json');
      this.index = await asset.json();
      this.index.sort((a, b) => b.setName.localeCompare(a.setName) || a.packetNumber - b.packetNumber || a.number - b.number);
    }
    try {
      return Response.json(frequency ? this.frequency(options) : await this.search(options));
    } catch (error) {
      if (error.name?.startsWith('RE2JS')) return Response.json({ error: 'Invalid or unsupported regular expression.' }, { status: 400 });
      throw error;
    }
  }

  filter (options) {
    return this.index.filter(q => q.year >= options.minYear && q.year <= options.maxYear &&
      (!options.categories?.length || options.categories.includes(q.category)) &&
      (!options.setNames?.length || options.setNames.includes(q.setName)) &&
      (options.questionType === 'all' || options.questionType === q.kind));
  }

  async search (options) {
    const { queryString, regex, exactPhrase, ignoreWordOrder, caseSensitive, searchType } = options;
    const words = regex ? [queryString] : (ignoreWordOrder ? queryString.trim().split(/\s+/) : [queryString.trim()]);
    const patterns = words.filter(Boolean).map(word => {
      let pattern = regex ? word : escapePattern(word);
      if (exactPhrase && !regex) pattern = `\\b${pattern}\\b`;
      if (searchType === 'exactAnswer') pattern = `^\\s*${pattern}\\s*(\\[.*|\\(.*)?$`;
      return RE2JS.compile(pattern, caseSensitive ? 0 : RE2JS.CASE_INSENSITIVE);
    });
    let matches = this.filter(options).filter(q => patterns.every(pattern =>
      (['all', 'question'].includes(searchType) && pattern.test(q.question)) ||
      (['all', 'answer', 'exactAnswer'].includes(searchType) && pattern.test(q.answer))));
    if (options.randomize) {
      matches = [...matches];
      for (let i = matches.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [matches[i], matches[j]] = [matches[j], matches[i]];
      }
    }
    const result = { queryString };
    for (const kind of ['tossup', 'bonus']) {
      const all = matches.filter(q => q.kind === kind);
      const offset = (options[`${kind}Pagination`] - 1) * options.maxReturnLength;
      const selected = all.slice(offset, offset + options.maxReturnLength);
      const byId = new Map();
      for (let i = 0; i < selected.length; i += 80) {
        const ids = selected.slice(i, i + 80).map(q => q.id);
        const { results } = await this.env.DB.prepare(`SELECT id, data FROM questions WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
        for (const row of results) byId.set(row.id, JSON.parse(row.data));
      }
      result[kind === 'bonus' ? 'bonuses' : 'tossups'] = { count: all.length, questionArray: selected.map(q => byId.get(q.id)).filter(Boolean) };
    }
    return result;
  }

  frequency (options) {
    if (!options.category) return { frequencyList: [] };
    const counts = new Map();
    for (const q of this.filter({ ...options, categories: [options.category] })) {
      const answer = q.answer.split(/[([]/)[0].trim().replaceAll('-', ' ').toLowerCase();
      if (answer) counts.set(answer, (counts.get(answer) || 0) + 1);
    }
    const frequencyList = [...counts].map(([answer, count]) => ({ answer, count }))
      .sort((a, b) => b.count - a.count || a.answer.localeCompare(b.answer)).slice(0, options.limit);
    return { frequencyList };
  }
}
