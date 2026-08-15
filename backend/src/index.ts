import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

import projectsRouter from './routes/projects';
import commitsRouter from './routes/commits';
import stateRouter from './routes/state';
import roadmapRouter from './routes/roadmap';
import documentationRouter from './routes/documentation';
import drawingsRouter from './routes/drawings';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const STORAGE_PATH = process.env.STORAGE_PATH || './storage';

// ─── CORS ───
// Allow frontend dev server and common local dev origins
const allowedOrigins = [
  'http://localhost:5173',  // Vite default (frontend)
  'http://localhost:3000',  // fallback if frontend changes port
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // In dev, be permissive — log a warning but allow
    console.warn(`CORS: allowing unlisted origin ${origin}`);
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body parsing ───
app.use(express.json({ limit: '10mb' }));

// ─── Static file serving for uploads ───
app.use('/storage', express.static(path.resolve(STORAGE_PATH)));

// ─── Routes ───
app.use('/projects', projectsRouter);
app.use('/projects', commitsRouter);
app.use('/projects', stateRouter);
app.use('/projects', roadmapRouter);
app.use('/projects', documentationRouter);
app.use('/projects', drawingsRouter);

// ─── Health check ───
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Global error handler ───
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Multer errors (file too large, wrong type)
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File too large. Maximum size is 20MB.' });
    return;
  }
  if (err.message && err.message.includes('File type not allowed')) {
    res.status(400).json({ error: err.message });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Physical Git backend running on http://localhost:${PORT}`);
});

export default app;
