import { Router } from 'express';
import checkShortAnswer from 'qb-answer-checker';
import { createNsbAnswerChecker } from '../../shared/nsb-check-answer.js';
import validateString from '../validators/string.js';
import validateInt from '../validators/int.js';

const checkAnswer = createNsbAnswerChecker(checkShortAnswer);

const router = Router();

router.get('/', (req, res) => {
  const params = { ...req.query };
  for (const field of ['answerline', 'givenAnswer', 'question']) validateString(params, field);
  validateInt(params, 'strictness', { defaultValue: 7, lowerBound: 0 });
  const { answerline, givenAnswer, strictness, question } = params;
  if (answerline.length > 5000 || givenAnswer.length > 5000 || question.length > 20000) return res.status(400).json({ error: 'Invalid answer.' });
  const { directive, directedPrompt } = checkAnswer(answerline, givenAnswer, strictness, question);
  res.json({ directive, directedPrompt });
});

export default router;
