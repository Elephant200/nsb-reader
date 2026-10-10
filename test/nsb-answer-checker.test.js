import test from 'node:test';
import assert from 'node:assert/strict';
import checkShortAnswer from 'qb-answer-checker';
import { createNsbAnswerChecker } from '../shared/nsb-check-answer.js';
import CategoryManager from '../shared/category-manager.js';
import TossupRoom from '../shared/rooms/TossupRoom.js';
import BonusRoom from '../shared/rooms/BonusRoom.js';
import ServerTossupBonusRoom from '../server/multiplayer/ServerTossupBonusRoom.js';
import { BONUS_PROGRESS_ENUM, QUESTION_TYPE_ENUM } from '../shared/constants.js';

const check = createNsbAnswerChecker(checkShortAnswer);
test('source ordinal superscripts remain readable answer alternatives', () => {
  const key = '2 (ACCEPT: 2<sup>nd</sup> ORDER)';
  assert.equal(check(key, '2').directive, 'accept');
  assert.equal(check(key, '2nd order').directive, 'accept');
  assert.equal(check(key, '3rd order').directive, 'reject');
  assert.equal(check('2<sup>3</sup>', '23').directive, 'reject');
});

test('multiple choice accepts a letter or full choice, and rejects contradictory pairs', () => {
  const key = 'W) CARBON DIOXIDE';
  for (const answer of ['w', 'W)', 'carbon dioxide', 'W) carbon dioxide', 'W carbon dioxide']) {
    assert.equal(check(key, answer).directive, 'accept', answer);
  }
  for (const answer of ['x', 'carbon', 'X) carbon dioxide', 'W) oxygen', '', 'W or X']) {
    assert.equal(check(key, answer).directive, 'reject', answer);
  }
});
test('multiple choice does not use fuzzy matching or strip mathematical signs', () => {
  assert.equal(check('W) y = 4x − 3', 'y = 4x - 3').directive, 'accept');
  assert.equal(check('W) x − 2', 'x - 2').directive, 'accept');
  assert.equal(check('W) x²', 'x ^ 2').directive, 'accept');
  assert.equal(check('W) y = 4x − 3', 'Y) y = 4x - 3').directive, 'reject');
  assert.equal(check('Y) Z, W+, AND W- BOSONS', 'Z, W+, and W- bosons', 7, 'Which particles? W) A X) B Y) Z, W+, and W- bosons Z) D').directive, 'accept');
  assert.equal(check('W) X IS GREATER THAN 2', 'x is greater than 2', 7, 'Which condition? W) x is greater than 2 X) x is less than 2 Y) x is 0 Z) x is 1').directive, 'accept');
  assert.equal(check('X) -2', '2').directive, 'reject');
  assert.equal(check('X) -2', '-2').directive, 'accept');
  assert.equal(check('Z) SODIUM', 'sodum').directive, 'reject');
});
test('short answers retain answerline acceptance instructions', () => {
  assert.equal(check('MITOCHONDRION (ACCEPT: MITOCHONDRIA)', 'mitochondria').directive, 'accept');
  assert.equal(check('oxygen', '').directive, 'reject');
  assert.equal(check('LITHOGRAPHY (ACCEPT: SMALL-SCALE LITHOGRAPHY, MICRON-SCALE LITHOGRAPHY)', 'micron-scale lithography').directive, 'accept');
  assert.equal(check('f⁻¹(x) = (2+x)/x (ACCEPT: (2+x)/x, 1 + 2/x)', '1 + 2/x').directive, 'accept');
  assert.equal(check('3, 4, 1, 2 (ACCEPT: FATS, ETHANOL, PROTEINS, ORGANIC ACIDS)', 'fats').directive, 'reject');
  assert.equal(check('3, 4, 1, 2 (ACCEPT: FATS, ETHANOL, PROTEINS, ORGANIC ACIDS)', 'fats, ethanol, proteins, organic acids').directive, 'accept');
});

test('count and unit instructions constrain the response without becoming answer text', () => {
  const key = '(ACCEPT TWO) PHENYLALANINE, TYROSINE, TRYPTOPHAN, METHIONINE';
  assert.equal(check(key, 'tyrosine and methionine').directive, 'accept');
  for (const response of ['tyrosine', 'tyrosine and tyrosine', 'tyrosine and oxygen', 'tyrosine, methionine, tryptophan']) {
    assert.equal(check(key, response).directive, 'reject', response);
  }
  assert.equal(check('2s AND 2p [must give both answers]', '2p, 2s').directive, 'accept');
  assert.equal(check('2s AND 2p [must give both answers]', '2p').directive, 'reject');
  assert.equal(check('40 METERS (must give units)', '40 meters').directive, 'accept');
  assert.equal(check('40 METERS (must give units)', '40').directive, 'reject');
  assert.equal(check('-392 (must give negative value)', '-392').directive, 'accept');
  assert.equal(check('-392 (must give negative value)', '392').directive, 'reject');
});

test('numeric answers keep fraction denominators and signs', () => {
  assert.equal(check('7/5', '7').directive, 'reject');
  assert.equal(check('7/5', '7 / 5').directive, 'accept');
  assert.equal(check('7/5', '7⁄5').directive, 'accept');
  assert.equal(check('-2', '2').directive, 'reject');
});

test('source reading cues are not required answer text and mathematical brackets remain meaningful', () => {
  assert.equal(check('sp<sup>3</sup>d<sup>2</sup> [s-p-3-d-2]', 'sp^3d^2').directive, 'accept');
  assert.equal(check('SP<sup>3</sup>', 'sp^3').directive, 'accept');
  assert.equal(check('D²SP³', 'd^2sp^3').directive, 'accept');
  assert.equal(check('S²', 's^2').directive, 'reject');
  assert.equal(check('√3/3 [SQUARE ROOT OF 3 OVER 3]', 'sqrt(3)/3').directive, 'accept');
  assert.equal(check('0.0012 [NOTE: AQ = AQUEOUS; G = GASEOUS]', '.0012').directive, 'accept');
  assert.equal(check('X) GLIAL [GLEE-AL] CELL', 'glial cell').directive, 'accept');
  assert.equal(check('PYRUVATE (read as: py-RUH-vayt) [ACCEPT: PYRUVIC (read as: py-RUH-vik) ACID, CH₃COCO₂H]', 'CH3COCO2H').directive, 'accept');
  assert.equal(check('[Ar]3d⁵', '[Ar]3d^5').directive, 'accept');
  assert.equal(check('[Ar]3d⁵', '3d^5').directive, 'reject');
  assert.equal(check('[Co(NH₃)₆]³⁺', '[Co(NH3)6]^3+').directive, 'accept');
  assert.equal(check('[Co(NH₃)₆]³⁺', '[Co(NH3)6]^2+').directive, 'reject');
  assert.equal(check('[OH]⁻', '[OH]^-').directive, 'accept');
  assert.equal(check('[OH]⁻', '^-').directive, 'reject');
});

test('multiple choice accepts the displayed option when the answer key abbreviates it', () => {
  const question = 'Which?\nW) sodium chloride\nX) magnesium oxide\nY) calcium oxide\nZ) water';
  assert.equal(check('W) NaCl', 'sodium chloride', 7, question).directive, 'accept');
  assert.equal(check('W) NaCl', 'X sodium chloride', 7, question).directive, 'reject');
});

test('powers, chemical counts and charges retain their meaning across display formats', () => {
  const cases = [
    ['x<sup>2</sup>', 'x^2', 'accept'],
    ['x²', 'x2', 'reject'],
    ['x²', 'x^3', 'reject'],
    ['𝑥²', 'x^2', 'accept'],
    ['x<sup>y</sup>', 'xʸ', 'accept'],
    ['e<sup>2x</sup>', 'e²ˣ', 'accept'],
    ['a<sub>n−1</sub>', 'aₙ₋₁', 'accept'],
    ['a<sub>n−1</sub>', 'a(n-1)', 'reject'],
    ['m<sub>s</sub>', 'mₛ', 'accept'],
    ['10⁻⁶', '10^-6', 'accept'],
    ['10⁻⁶', '10^6', 'reject'],
    ['H<sub>2</sub>O', 'H₂O', 'accept'],
    ['H₂O', 'H2O', 'accept'],
    ['H₂O', 'H₂', 'reject'],
    ['H₂O', 'H₂O₂', 'reject'],
    ['NaCl', 'Na', 'reject'],
    ['CO', 'Co', 'reject'],
    ['At', 'at', 'reject'],
    ['Fe<sup>3+</sup>', 'Fe³⁺', 'accept'],
    ['Fe³⁺', 'Fe3+', 'accept'],
    ['Fe³⁺', 'Fe²⁺', 'reject'],
    ['Fe³⁺', 'Fe³⁻', 'reject'],
    ['SO₄²⁻', 'SO4^2-', 'accept'],
    ['SO₄²⁻', 'SO4^2+', 'reject'],
    ['W) CO', 'Co', 'reject'],
    ['W) H<sub>2</sub>O', 'H2O', 'accept'],
    ['W) H₂O', 'H₂', 'reject']
  ];
  for (const [key, response, expected] of cases) assert.equal(check(key, response).directive, expected, `${key} / ${response}`);
});

test('uppercase prose is not mistaken for an all-capital chemical formula', () => {
  for (const answer of ['SUN', 'IONIC', 'BOSONS', 'PHONON', 'FUSION']) {
    assert.equal(check(answer, answer.toLowerCase()).directive, 'accept', answer);
  }
  assert.equal(check('CO', 'Co').directive, 'reject');
  assert.equal(check('Co', 'CO').directive, 'reject');
  assert.equal(check('SUN (ACCEPT: SOL; DO NOT ACCEPT: STAR)', 'sol').directive, 'accept');
  assert.equal(check('SUN (ACCEPT: SOL; DO NOT ACCEPT: STAR)', 'star').directive, 'reject');
});

test('scalar equivalence is exact and malformed grouping is not erased', () => {
  assert.equal(check('(-2, 2]', '(-2,2]').directive, 'accept');
  assert.equal(check('(-2, 2]', '[-2,2]').directive, 'reject');
  assert.equal(check('[-2, 2)', '[-2,2)').directive, 'accept');
  assert.equal(check('[-2, 2)', '[-2,2]').directive, 'reject');
  const fraction = '<span class="nsb-fraction"><span>1</span><span>2</span></span>';
  for (const key of ['1/2', '½', fraction, '(1/2)', '(1)/(2)']) assert.equal(check(key, '.5').directive, 'accept', key);
  for (const [key, response] of [['1/3', '.333'], ['-2', '2'], ['1/2', '1'], ['1/(2+3)', '1/2+3'], ['(1/2', '1/2'], ['1//2', '1/2'], ['(1)(2)', '12'], ['x-y', 'xy'], ['f(x)', 'fx']]) {
    assert.equal(check(key, response).directive, 'reject', `${key} / ${response}`);
  }
  for (const [key, response] of [['1/-2', '-1/2'], ['+2', '2'], ['1.0', '1'], ['1.7 × 10⁻⁵', '0.000017']]) assert.equal(check(key, response).directive, 'accept', `${key} / ${response}`);
  for (const invalid of ['(1/2', '1//2', 'x^^2', 'x^']) assert.equal(check(invalid, invalid).directive, 'reject', invalid);
  assert.equal(check('12', '1 2').directive, 'reject');
  assert.equal(check('1.5', '1 .5').directive, 'reject');
  assert.equal(check('-2 9/20', '-2.45').directive, 'accept');
  assert.equal(check('<span class="nsb-fraction"><span>x + 1</span><span>y</span></span>', '(x+1)/y').directive, 'accept');
  assert.equal(check('<span class="nsb-fraction"><span>x + 1</span><span>y</span></span>', 'x+1/y').directive, 'reject');
});

test('scientific alternatives honor explicit source instructions without losing math groups', () => {
  const decimalOnly = '0.001 (ACCEPT: 1/1000; DO NOT ACCEPT: 1 × 10<sup>−3</sup>)';
  assert.equal(check(decimalOnly, '1/1000').directive, 'accept');
  assert.equal(check(decimalOnly, '0.001').directive, 'accept');
  assert.equal(check(decimalOnly, '1 × 10^-3').directive, 'reject');
  assert.equal(check('x² (ACCEPT: (x)(x); DO NOT ACCEPT: x)', '(x)(x)').directive, 'accept');
  assert.equal(check('2 (ACCEPT: 1/2)', '0.5').directive, 'accept');
  assert.equal(check('2 (DO NOT ACCEPT: 1/2)', '0.5').directive, 'reject');
  assert.equal(check('x² (ACCEPT: (x)(x))', '(x)(x)').directive, 'accept');
  assert.equal(check('x² (DO NOT ACCEPT: x)', 'x').directive, 'reject');
  assert.equal(check('2 METERS', '2 meters').directive, 'accept');
  assert.equal(check('2 METERS', '2 seconds').directive, 'reject');
  assert.equal(check('2 METERS', '2').directive, 'reject');
  assert.equal(check('2.0 METERS', '2 meters').directive, 'accept');
  assert.equal(check('+5 (DO NOT ACCEPT: 5)', '+5').directive, 'accept');
  assert.equal(check('+5 (DO NOT ACCEPT: 5)', '5').directive, 'reject');
  assert.equal(check('1 × 10⁷ (DO NOT ACCEPT: 10⁷)', '1 × 10^7').directive, 'accept');
  assert.equal(check('1 × 10⁷ (DO NOT ACCEPT: 10⁷)', '10^7').directive, 'reject');
  assert.equal(check('6 TIMES 10⁻³²', '6e-32').directive, 'accept');
  assert.equal(check('6 TIMES 10⁻³²', '6 x 10^-32').directive, 'accept');
  assert.equal(check('6 TIMES 10⁻³²', '6e32').directive, 'reject');
  assert.equal(check('2 × 10³', '2000', 7, 'Express your answer in scientific notation.').directive, 'reject');
  assert.equal(check('2 × 10³', '2e3', 7, 'Express your answer in scientific notation.').directive, 'accept');
  assert.equal(check('2 × 10³ (ACCEPT: 2000)', '2000', 7, 'Express your answer in scientific notation.').directive, 'accept');
  assert.equal(check('Z) HEAT FLOW INTO OR OUT OF THE SYSTEM', 'Z) HEAT FLOW INTO OR OUT OF THE SYSTEM').directive, 'accept');
  assert.equal(check('Z) HEAT FLOW INTO OR OUT OF THE SYSTEM', 'heat flow into').directive, 'reject');
});

test('required lists do not accept a single component and honor stated order', () => {
  assert.equal(check('1, 2, AND 3', '1, 2, 3').directive, 'accept');
  assert.equal(check('1, 2, AND 3', '1, 2').directive, 'reject');
  assert.equal(check('(1, 14, −16) (ACCEPT: x = 1, y = 14, AND z = −16)', 'x = 1, y = 14, z = -16').directive, 'accept');
  assert.equal(check('240 (ACCEPT: 250, 260, 270, 280, 290)', '270').directive, 'accept');
  assert.equal(check('240 (ACCEPT: 250, 260, 270, 280, 290)', '250260270280290').directive, 'reject');
  assert.equal(check('1000 (ACCEPT: 1,000, 2,000)', '2000').directive, 'accept');
  assert.equal(check('1000 (ACCEPT: 1,000, 2,000)', '2').directive, 'reject');
  const hybridizations = '1) sp³; 2) d²sp³ (ACCEPT: sp³d²); 3) sp²';
  assert.equal(check(hybridizations, 'sp^3; sp^3d^2; sp^2').directive, 'accept');
  assert.equal(check(hybridizations, '1) sp^3; 2) sp^3d^2; 3) sp^2').directive, 'accept');
  assert.equal(check(hybridizations, 'sp^3d^2').directive, 'reject');
  assert.equal(check(hybridizations, 'sp^3; sp^3d^2; sp^3').directive, 'reject');
  assert.equal(check('1) 2, 2) 3, 3) 2, 4) 5', '2, 3, 2, 5').directive, 'accept');
  assert.equal(check('WATER VAPOR (ACCEPT: WATER) AND CARBON DIOXIDE', 'water').directive, 'reject');
  assert.equal(check('WATER VAPOR (ACCEPT: WATER) AND CARBON DIOXIDE', 'water and carbon dioxide').directive, 'accept');
  assert.equal(check('0.25 (ACCEPT: ¼) AND 1', '1/4 and 1').directive, 'accept');
  assert.equal(check('0.25 (ACCEPT: ¼) AND 1', '1/4').directive, 'reject');
  assert.equal(check('0.25 (ACCEPT: ¼) AND 1 (IN ANY ORDER)', '1 and 1/4').directive, 'accept');
  assert.equal(check('0.25 (ACCEPT: ¼) AND 1 (IN ANY ORDER)', '1/4 and 1/4').directive, 'reject');
  assert.equal(check('1) ¼; 2) 1 (IN ANY ORDER)', '1 and 1/4').directive, 'accept');
  assert.equal(check('1) ¼; 2) 1 (IN ANY ORDER)', '1) 1; 2) 1/4').directive, 'reject');
  assert.equal(check('1 OR 3 (MUST GIVE BOTH ANSWERS) (IN THIS ORDER)', '3 and 1').directive, 'reject');
  const extremum = 'RELATIVE MINIMUM (ACCEPT: MINIMUM) AT (0, 1) [DO NOT ACCEPT: (0, 1) ALONE]';
  assert.equal(check(extremum, 'MINIMUM AT (0,1)').directive, 'accept');
  assert.equal(check(extremum, 'minimum at (0,1)').directive, 'accept');
  assert.equal(check(extremum, 'MINIMUM').directive, 'reject');
  assert.equal(check(extremum, '(0,1)').directive, 'reject');
  const sugars = 'POLYSACCHARIDE (ACCEPT: STARCH, DO NOT ACCEPT: GLYCOGEN) AND MONOSACCHARIDE (ACCEPT: SIMPLE SUGAR, REDUCING SUGAR)';
  assert.equal(check(sugars, 'starch and simple sugar').directive, 'accept');
  assert.equal(check(sugars, 'glycogen and simple sugar').directive, 'reject');
  assert.equal(check('1) IRON 2 PLUS ION; 2) OXYGEN 2 MINUS ION; 3) GALLIUM ATOM', 'iron 2 plus ion; oxygen 2 minus ion; gallium atom').directive, 'accept');
  assert.equal(check('1 OR 3 (MUST GIVE BOTH ANSWERS)', '1').directive, 'reject');
  assert.equal(check('1 OR 3 (MUST GIVE BOTH ANSWERS)', '3 and 1').directive, 'accept');
  assert.equal(check('MARS; JUPITER (IN ANY ORDER)', 'Jupiter, Mars').directive, 'accept');
  assert.equal(check('MARS; JUPITER (IN ANY ORDER)', 'Mars').directive, 'reject');
  assert.equal(check('MARS; JUPITER (IN THIS ORDER)', 'Jupiter, Mars').directive, 'reject');
  assert.equal(check('MARS; JUPITER (IN THIS ORDER)', 'Mars and Jupiter').directive, 'accept');
  assert.equal(check('(8, 0) (DO NOT ACCEPT: 8 ALONE)', '8').directive, 'reject');
  assert.equal(check('(8, 0) (DO NOT ACCEPT: 8 ALONE)', '(8,0)').directive, 'accept');
  const coordinate = '(−7, 4) (ACCEPT: x = −7 AND y = 4)';
  assert.equal(check(coordinate, '(-7,4)').directive, 'accept');
  assert.equal(check(coordinate, 'x = -7 and y = 4').directive, 'accept');
  assert.equal(check(coordinate, 'x = -7').directive, 'reject');
  assert.equal(check(coordinate, 'y = 4').directive, 'reject');
  assert.equal(check('(−7, 4) (ACCEPT: x = −7, y = 4)', 'x = -7').directive, 'reject');
  assert.equal(check('(−7, 4) (ACCEPT: x = −7, y = 4)', 'x = -7, y = 4').directive, 'accept');
  const domain = '(−∞, −9) ∪ (−9, −4] ∪ [4, ∞)';
  assert.equal(check(domain, '(-∞,-9) ∪ (-9,-4] ∪ [4,∞)').directive, 'accept');
  assert.equal(check(domain, '(-∞,-9) ∪ [-9,-4] ∪ [4,∞)').directive, 'reject');
  assert.equal(check('f(x, y)', 'f(x,y]').directive, 'reject');
});

test('solo and multiplayer grade rich answer keys independently of reading text', () => {
  const solo = new TossupRoom('solo', new CategoryManager(), ['tossups']);
  solo.checkAnswer = check;
  const multiplayer = new ServerTossupBonusRoom('math-check', 'owner', false, new CategoryManager());
  clearInterval(multiplayer.cleanupInterval);
  for (const room of [solo, multiplayer]) {
    room.tossup = { question: 'What is the power?', question_sanitized: 'What is the power?', answer: 'x<sup>2</sup>', answer_sanitized: 'x2' };
    room.questionSplit = ['What', 'is', 'the', 'power?'];
    room.wordIndex = 4;
    assert.equal(room.scoreTossup({ givenAnswer: 'x^2' }).directive, 'accept');
    assert.equal(room.scoreTossup({ givenAnswer: 'x2' }).directive, 'reject');
  }
  const bonus = new BonusRoom('bonus', new CategoryManager(), ['bonuses']);
  bonus.checkAnswer = check;
  multiplayer.players.owner = { teamId: 'team' };
  multiplayer.bonusEligibleTeamId = 'team';
  multiplayer.currentQuestionType = QUESTION_TYPE_ENUM.BONUS;
  for (const room of [bonus, multiplayer]) {
    const messages = [];
    room.emitMessage = message => messages.push(message);
    room.revealNextAnswer = () => {};
    room.revealNextPart = () => {};
    room.bonus = { parts: ['Formula?'], answers: ['H<sub>2</sub>O'], answers_sanitized: ['H2'], values: [10] };
    room.currentPartNumber = 0;
    room.bonusProgress = BONUS_PROGRESS_ENUM.READING;
    room.bonusAnswerer = 'owner';
    room.pointsPerPart = [];
    room.giveBonusAnswer({ userId: 'owner', username: 'Reader' }, { givenAnswer: 'H2O' });
    assert.equal(messages.find(message => message.directive)?.directive, 'accept');
    assert.deepEqual(room.pointsPerPart, [10]);
  }
});
