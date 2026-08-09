import { Router } from 'express';

const router = Router();

// PATCH /projects/:id/roadmap — Update roadmap state
router.patch('/:id/roadmap', async (req, res) => {
  // TODO: implement
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
