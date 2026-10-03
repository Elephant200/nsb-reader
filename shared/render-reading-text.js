import { escapeHTML } from './string-utils.js';

export function renderReadingText (text) {
  return escapeHTML(text).replace(/\n/g, '<br>').replace(/(^|\s)([WXYZ]\))/g, '<br>$2');
}
