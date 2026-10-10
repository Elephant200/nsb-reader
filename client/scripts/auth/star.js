export default class star {
  static starredSvg = '<i class="bi bi-star-fill"></i>';
  static unstarredSvg = '<i class="bi bi-star"></i>';

  static ids (type) {
    try { return JSON.parse(window.localStorage.getItem('nsb-stars-' + type) ?? '[]'); } catch { return []; }
  }

  static save (type, id, starred) {
    const ids = new Set(this.ids(type));
    if (starred) ids.add(id); else ids.delete(id);
    try { window.localStorage.setItem('nsb-stars-' + type, JSON.stringify([...ids])); return true; } catch { return false; }
  }

  static async starTossup (id) { return this.save('tossups', id, true); }
  static async starBonus (id) { return this.save('bonuses', id, true); }
  static async unstarTossup (id) { return this.save('tossups', id, false); }
  static async unstarBonus (id) { return this.save('bonuses', id, false); }
  static async isStarredTossup (id) { return this.ids('tossups').includes(id); }
  static async isStarredBonus (id) { return this.ids('bonuses').includes(id); }
  static async getStarredTossupIds () { return this.ids('tossups'); }
  static async getStarredBonusIds () { return this.ids('bonuses'); }
  static async clearStarredTossups () { window.localStorage.removeItem('nsb-stars-tossups'); }
  static async clearStarredBonuses () { window.localStorage.removeItem('nsb-stars-bonuses'); }
}
