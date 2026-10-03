/** In-person two-team practice state, independent of transport and question storage. */
export default class ReaderRoom {
  constructor () {
    this.players = {};
    this.teams = [[], []];
    this.scores = [0, 0];
    this.bonuses = [{ correct: 0, misses: 0 }, { correct: 0, misses: 0 }];
    this.pair = null;
    this.kind = 'tossup';
    this.pending = null;
    this.result = null;
    this.bonusTeam = null;
    this.timer = { started: false, remaining: 5000, deadline: null };
    this.paused = false;
    this.lastJudgment = null;
  }

  /** Register a device with a generated username and balanced team assignment. */
  join (id, username) {
    if (!this.players[id]) {
      this.players[id] = { id, username, online: true, buzzes: 0, correct: 0, misses: 0, interrupts: 0 };
      this.teams[this.teams[0].length <= this.teams[1].length ? 0 : 1].push(id);
    }
    this.players[id].online = true;
  }

  assignment (id) {
    if (this.players[id]?.kicked) return this.players[id].lastAssignment;
    const team = this.teams[0].includes(id) ? 0 : 1;
    const index = this.teams[team].indexOf(id);
    const position = ['Captain', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][index] || String(index);
    return { team, title: `${team === 0 ? 'A' : 'B'} ${position}` };
  }

  /** Move a player to an insertion point; identity and statistics follow the device. */
  move (id, team, index) {
    if (!Object.hasOwn(this.players, id) || this.players[id].kicked || this.pending) return false;
    const oldTeam = this.assignment(id).team;
    const oldIndex = this.teams[oldTeam].indexOf(id);
    if (index < 0 || index > this.teams[team].length) return false;
    this.teams[oldTeam].splice(oldIndex, 1);
    if (oldTeam === team && oldIndex < index) index--;
    this.teams[team].splice(index, 0, id);
    return true;
  }

  remaining (now = Date.now()) {
    return this.timer.deadline === null ? this.timer.remaining : Math.max(0, this.timer.deadline - now);
  }

  stopTimer () {
    this.timer.remaining = this.remaining();
    this.timer.deadline = null;
  }

  resetQuestion () {
    this.pending = null;
    this.result = null;
    this.lastJudgment = null;
    this.paused = false;
    this.timer = { started: false, remaining: this.kind === 'bonus' ? 20000 : 5000, deadline: null };
  }

  needsQuestion () {
    return !this.pair || (this.result !== null && !(this.kind === 'tossup' && this.result && this.pair.bonus));
  }

  load (pair) {
    if (!this.needsQuestion()) return false;
    this.pair = pair;
    this.kind = 'tossup';
    this.bonusTeam = null;
    this.resetQuestion();
    return true;
  }

  nextBonus () {
    if (this.kind !== 'tossup' || !this.result || !this.pair?.bonus) return false;
    this.kind = 'bonus';
    this.resetQuestion();
    return true;
  }

  canBuzz (id) {
    return !!this.players[id]?.online && !!this.pair && this.kind === 'tossup' &&
      this.result === null && !this.pending && !this.paused && (!this.timer.started || this.remaining() > 0);
  }

  buzz (id) {
    if (!this.canBuzz(id)) return false;
    this.pending = { id, team: this.assignment(id).team, interrupt: !this.timer.started };
    this.players[id].buzzes++;
    this.stopTimer();
    return true;
  }

  /** Apply an authenticated reader action. */
  action (message) {
    if (!this.pair) return false;
    if (message.type === 'judge') return this.judge(message.correct, message.interrupt);
    if (message.type === 'no-answer' && !this.pending && this.result === null) {
      this.stopTimer();
      this.result = false;
      return true;
    }
    if (this.result !== null || this.pending) return false;
    if (message.type === 'start-timer' && this.timer.deadline === null && this.timer.remaining > 0) {
      this.timer.started = true;
      this.timer.deadline = Date.now() + this.timer.remaining;
      this.paused = false;
    } else if (message.type === 'pause-timer') {
      this.stopTimer();
      this.paused = true;
    } else if (message.type === 'reset-timer') {
      this.timer = { started: false, remaining: this.kind === 'bonus' ? 20000 : 5000, deadline: null };
      this.paused = false;
    } else return false;
    return true;
  }

  /** Judge or correct the current answer without accumulating duplicate scores. */
  judge (correct, interrupt) {
    if (typeof correct !== 'boolean') return false;
    const attempt = this.pending || this.lastJudgment?.attempt;
    if (this.kind === 'tossup' && !attempt) return false;
    const team = this.kind === 'bonus' ? this.bonusTeam : attempt.team;
    if (team === null) return false;
    if (this.lastJudgment) {
      this.scores = [...this.lastJudgment.scores];
      this.bonuses = structuredClone(this.lastJudgment.bonuses);
      if (attempt) Object.assign(this.players[attempt.id], this.lastJudgment.stats);
    } else {
      const p = attempt && this.players[attempt.id];
      this.lastJudgment = {
        attempt,
        scores: [...this.scores],
        bonuses: structuredClone(this.bonuses),
        stats: p ? { correct: p.correct, misses: p.misses, interrupts: p.interrupts } : null
      };
    }
    if (this.kind === 'bonus') {
      this.bonuses[team][correct ? 'correct' : 'misses']++;
      if (correct) this.scores[team] += 10;
    } else {
      const p = this.players[attempt.id];
      p[correct ? 'correct' : 'misses']++;
      const interrupted = typeof interrupt === 'boolean' ? interrupt : attempt.interrupt;
      attempt.interrupt = interrupted;
      if (interrupted) p.interrupts++;
      if (correct) this.scores[team] += 4;
      else if (interrupted) this.scores[1 - team] += 4;
      this.bonusTeam = correct ? team : null;
    }
    this.stopTimer();
    this.result = correct;
    this.pending = null;
    return true;
  }

  /** Player payload excludes questions, answers, scores, timers, and other players. */
  playerView (id, readerOnline) {
    return { type: 'state', role: 'player', username: this.players[id].username, ...this.assignment(id), canBuzz: readerOnline && this.canBuzz(id), buzzed: this.pending?.id === id, readerOnline };
  }

  readerView () {
    return {
      type: 'state',
      role: 'reader',
      serverTime: Date.now(),
      players: Object.fromEntries(Object.entries(this.players).map(([id, p]) => [id, { ...p, ...this.assignment(id) }])),
      teams: this.teams,
      scores: this.scores,
      bonuses: this.bonuses,
      pair: this.pair,
      kind: this.kind,
      pending: this.pending,
      result: this.result,
      bonusTeam: this.bonusTeam,
      timer: { ...this.timer, remaining: this.remaining() },
      paused: this.paused,
      judgedAttempt: this.lastJudgment?.attempt || null
    };
  }
}
