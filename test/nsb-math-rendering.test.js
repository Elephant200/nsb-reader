import assert from 'node:assert/strict';
import test from 'node:test';

import { renderReadingText } from '../shared/render-reading-text.js';

test('progressive math rendering keeps explicit superscript and subscript markup', () => {
  assert.equal(
    renderReadingText('x<sup>3</sup> + H<sub>2</sub>O'),
    'x<sup>3</sup> + H<sub>2</sub>O'
  );
});

test('math rendering keeps fractions and bold emphasis while escaping other span markup', () => {
  assert.equal(
    renderReadingText('<span class="nsb-fraction"><span>125</span><span>343</span></span> <b>bold</b>'),
    '<span class="nsb-fraction"><span>125</span><span>343</span></span> <b>bold</b>'
  );
  assert.equal(renderReadingText('<span class="other">text</span>'), '&lt;span class=&quot;other&quot;&gt;text&lt;/span&gt;');
});

test('progressive math rendering keeps unicode and character references', () => {
  assert.equal(
    renderReadingText('π × 10⁻⁶ ≤ ²³⁵U &alpha; &amp;'),
    'π × 10⁻⁶ ≤ ²³⁵U &alpha; &amp;'
  );
});

test('reading text preserves newlines and puts choices on separate lines', () => {
  assert.equal(
    renderReadingText('Pick one:\nW) x²\nX) H₂O'),
    'Pick one:<br>W) x²<br>X) H₂O'
  );
});

test('reading text escapes unsupported markup and never infers exponents', () => {
  assert.equal(renderReadingText('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(renderReadingText('x2 - 10-6'), 'x2 - 10-6');
});

test('explicit reading notation renders powers and subscripts without flattening operands', () => {
  assert.equal(renderReadingText('x^2 + 10^(-6) + NH_(4)^(+)'), 'x² + 10⁻⁶ + NH₄⁺');
  assert.equal(renderReadingText('pK_(a) + pK_(b)'), 'pKₐ + pK<sub>b</sub>');
  assert.equal(renderReadingText('x^(2/3) + x^(n+1)'), 'x<sup>2/3</sup> + x<sup>n+1</sup>');
  assert.equal(renderReadingText('∑_(n=1)^(∞) + lim_(x→π/3)'), '∑ₙ₌₁<sup>∞</sup> + lim<sub>x→π/3</sub>');
  assert.equal(renderReadingText('e^(cos\u00a0x)'), 'e<sup>cos\u00a0x</sup>');
  assert.equal(renderReadingText('e^(ln(x)) + a^(b^(n+1))'), 'e<sup>ln(x)</sup> + a<sup>b<sup>n+1</sup></sup>');
  assert.equal(renderReadingText('x^2/3 + x^2.5 + x2'), 'x^2/3 + x^2.5 + x2');
  assert.equal(renderReadingText('x^(<img src=x>)'), 'x^(&lt;img src=x&gt;)');
});
