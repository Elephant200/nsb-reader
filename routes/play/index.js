import mpRouter from './mp.js';

import { Router } from 'express';
const router = Router();

router.use('/mp', mpRouter);
router.get('/in-person/prototype', (_req, res) => res.redirect('/play/in-person/'));

export default router;
