import { Router } from 'express';

const router = Router();

// POST /projects — Create a new project
router.post('/', async (req, res) => {
  // TODO: implement
  res.status(501).json({ error: 'Not implemented' });
});

// GET /projects/:id — Get a project by ID
router.get('/:id', async (req, res) => {
  // TODO: implement
  res.status(501).json({ error: 'Not implemented' });
});

export default router;
