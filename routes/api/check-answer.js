import { Router } from 'express';
import checkShortAnswer from 'qb-answer-checker';
import { createNsbAnswerChecker } from '../../shared/nsb-check-answer.js';

const checkAnswer = createNsbAnswerChecker(checkShortAnswer);

const router = Router();

router.get('/', (req, res) => {
  const { answerline, givenAnswer, strictness } = req.query;
  const { directive, directedPrompt } = checkAnswer(answerline, givenAnswer, strictness);
  res.json({ directive, directedPrompt });
});

export default router;
