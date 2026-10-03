import { Router } from 'express';
import getPairedBonus from '../../database/qbreader/get-paired-bonus.js';

const router = Router();

router.get('/', async (req, res) => {
  const { packetId, number } = req.query;
  const bonus = await getPairedBonus(packetId, parseInt(number));
  res.json({ bonus: bonus ?? null });
});

export default router;
