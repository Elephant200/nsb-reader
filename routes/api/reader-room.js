import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createReaderRoom } from '../../server/multiplayer/reader-rooms.js';

const router = Router();
router.post('/', rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false }), (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store').status(201).json(createReaderRoom());
  } catch {
    res.status(503).json({ message: 'Room capacity reached.' });
  }
});
export default router;
