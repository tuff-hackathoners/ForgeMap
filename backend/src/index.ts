import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

import projectsRouter from './routes/projects';
import commitsRouter from './routes/commits';
import stateRouter from './routes/state';
import roadmapRouter from './routes/roadmap';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const STORAGE_PATH = process.env.STORAGE_PATH || './storage';

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files statically
app.use('/storage', express.static(path.resolve(STORAGE_PATH)));

// Routes
app.use('/projects', projectsRouter);
app.use('/projects', commitsRouter);
app.use('/projects', stateRouter);
app.use('/projects', roadmapRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Physical Git backend running on http://localhost:${PORT}`);
});

export default app;
