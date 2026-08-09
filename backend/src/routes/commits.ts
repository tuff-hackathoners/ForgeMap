import { Router } from 'express';

const router = Router();

// POST /projects/:id/commits — Create a new commit (with photo upload)
router.post('/:id/commits', async (req, res) => {
  // TODO: implement
  res.status(501).json({ error: 'Not implemented' });
});

// GET /projects/:id/commits — Get all commits for a project
router.get('/:id/commits', async (req, res) => {
  // TODO: implement
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
