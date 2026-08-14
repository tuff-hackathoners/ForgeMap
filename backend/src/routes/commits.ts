import { Router, Request, Response } from 'express';
import { CommitModel } from '../models/Commit';
import { ProjectModel } from '../models/Project';
import { RoadmapTaskModel } from '../models/RoadmapTask';
import { analyzeProgress } from '../services/aiClient';
import upload, { saveUploadedFile } from '../middleware/upload';

const router = Router();

const STORAGE_PATH = process.env.STORAGE_PATH || './storage';

// POST /projects/:id/commits — Create a new commit (with photo upload)
router.post('/:id/commits', upload.single('photo'), async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.id as string;

    // Verify project exists
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    // Validate: need at least a photo or a note
    if (!req.file && !req.body.note && !req.body.userNote) {
      res.status(400).json({ error: 'A photo or a note is required to create a commit.' });
      return;
    }

    // Generate commit ID early so we can use it in the filename
    const commitId = CommitModel.generateId();

    // Save uploaded file if present
    let mediaUrl: string | null = null;
    if (req.file) {
      try {
        mediaUrl = saveUploadedFile(req.file, projectId, commitId, STORAGE_PATH);
      } catch (fileErr: any) {
        console.error('File save error:', fileErr);
        res.status(500).json({ error: 'Failed to save uploaded file.' });
        return;
      }
    }

    // Get user note from body (multipart form field)
    const userNote = req.body.note || req.body.userNote || null;

    // Call AI service to analyze progress (falls back gracefully)
    const imageBuffer = req.file ? req.file.buffer : null;
    const currentState = {
      roadmapTasks: project.roadmapTasks.map(RoadmapTaskModel.serialize),
      commits: project.commits.map(CommitModel.serialize),
    };
    const { result: analysis, fromAI } = await analyzeProgress(imageBuffer, userNote, currentState);

    // Build roadmap state from current tasks
    const roadmapState = project.roadmapTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: analysis.completedTasks.includes(task.title) ? 'completed' : task.status,
    }));

    // Persist the commit
    const commit = await CommitModel.createWithId(commitId, {
      projectId,
      mediaUrl: mediaUrl ?? undefined,
      userNote: userNote ?? undefined,
      detectedChanges: analysis.detectedChanges,
      projectState: analysis.projectState,
      completedTasks: analysis.completedTasks,
      feedback: analysis.feedback ?? undefined,
      roadmapState,
    });

    // Update roadmap task statuses based on AI analysis
    for (const task of project.roadmapTasks) {
      if (analysis.completedTasks.includes(task.title) && task.status !== 'completed') {
        await RoadmapTaskModel.updateStatus(task.id, 'completed');
      }
    }

    res.status(201).json({
      commit: CommitModel.serialize(commit),
      analysis: {
        summary: analysis.summary,
        nextSteps: analysis.nextSteps,
        nextStep: analysis.nextStep || null,
        feedback: analysis.feedback || null,
        fromAI,
      },
    });
  } catch (err: any) {
    console.error('POST /projects/:id/commits error:', err);
    res.status(500).json({ error: 'Failed to create commit.' });
  }
});

// GET /projects/:id/commits — Get all commits for a project (chronological)
router.get('/:id/commits', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.id as string;

    // Verify project exists
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const commits = await CommitModel.findByProjectId(projectId);

    res.json({
      projectId,
      count: commits.length,
      commits: commits.map(CommitModel.serialize),
    });
  } catch (err: any) {
    console.error('GET /projects/:id/commits error:', err);
    res.status(500).json({ error: 'Failed to fetch commits.' });
  }
});

export default router;
