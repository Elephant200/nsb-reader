import { _id as validateId } from '../validators/object-id.js';
import reportQuestion from '../../database/qbreader/report-question.js';

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const router = Router();
router.use(rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // Limit each IP to 30 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false // Disable the `X-RateLimit-*` headers
}));

router.post('/', async (req, res) => {
  const { _id } = validateId({ _id: req.body._id });
  if (!_id) {
    return res.status(400).send('Invalid ID');
  }

  const reason = req.body.reason ?? '';
  const description = req.body.description ?? '';
  if (typeof reason !== 'string' || typeof description !== 'string' ||
      !reason.trim() || reason.length > 200 || description.length > 5000) {
    return res.status(400).send('Provide a reason and a description of at most 5000 characters');
  }
  let successful;
  try {
    successful = await reportQuestion(_id, reason.trim(), description.trim());
  } catch (error) {
    return res.sendStatus(500);
  }
  if (successful) {
    return res.sendStatus(200);
  } else {
    return res.sendStatus(404);
  }
});

export default router;
