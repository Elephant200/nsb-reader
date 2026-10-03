import { Router } from 'express';
import getPairedBonus from '../../database/qbreader/get-paired-bonus.js';
import validateId from '../validators/object-id.js';

const router = Router();

router.get('/', async (req, res) => {
  const { packetId, number } = req.query;
  if (!validateId({ packetId }, 'packetId').packetId || !/^\d+$/.test(number ?? '') || Number(number) < 1) {
    return res.status(400).send('Invalid packet or question number');
  }
  const bonus = await getPairedBonus(packetId, parseInt(number));
  res.json({ bonus: bonus ?? null });
});

export default router;
