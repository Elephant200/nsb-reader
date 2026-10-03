import { Router } from 'express';

const router = Router();
router.get('/get-profile', (_req, res) => res.json(null));
router.get('/get-username', (_req, res) => res.json({ username: null }));
export default router;
