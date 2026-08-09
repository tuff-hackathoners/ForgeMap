import { Router } from 'express';

const router = Router();

// GET /projects/:id/state — Get current project state
router.get('/:id/state', async (req, res) => {
  // TODO: implement
  res.status(501).json({ error: 'Not implemented' });
});

// GET /projects/:id/diff — Get diff between current and previous state
router.get('/:id/diff', async (req, res) => {
  // TODO: implement
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
