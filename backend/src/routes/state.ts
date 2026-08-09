import { Router, Request, Response } from 'express';
import { CommitModel } from '../models/Commit';
import { ProjectModel } from '../models/Project';
import { computeDiff, ProjectState } from '../services/diffEngine';

const router = Router();

// GET /projects/:id/state — Get current project state (from latest commit)
router.get('/:id/state', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.id as string;

    // Verify project exists
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    // Get the latest commit
    const commits = await CommitModel.findByProjectId(projectId);
    if (commits.length === 0) {
      // No commits yet — return empty state
      res.json({
        projectId,
        state: {
          components: [],
          completedTasks: [],
          remainingTasks: project.roadmapTasks.map((t) => t.title),
          problems: [],
        },
        commitId: null,
        timestamp: null,
      });
      return;
    }

    // Latest commit is first (ordered desc)
    const latest = commits[0];
    const serialized = CommitModel.serialize(latest);

    res.json({
      projectId,
      state: serialized.projectState || {
        components: [],
        completedTasks: [],
        remainingTasks: [],
        problems: [],
      },
      commitId: latest.id,
      timestamp: latest.timestamp,
    });
  } catch (err: any) {
    console.error('GET /projects/:id/state error:', err);
    res.status(500).json({ error: 'Failed to fetch project state.' });
  }
});

// GET /projects/:id/diff — Diff between latest two commits
router.get('/:id/diff', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.id as string;

    // Verify project exists
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    // Get commits ordered by timestamp descending
    const commits = await CommitModel.findByProjectId(projectId);

    if (commits.length === 0) {
      res.status(404).json({ error: 'No commits found. Nothing to diff.' });
      return;
    }

    const latestSerialized = CommitModel.serialize(commits[0]);
    const currState: ProjectState = latestSerialized.projectState || {
      components: [],
      completedTasks: [],
      remainingTasks: [],
      problems: [],
    };

    let prevState: ProjectState | null = null;
    if (commits.length >= 2) {
      const prevSerialized = CommitModel.serialize(commits[1]);
      prevState = prevSerialized.projectState || null;
    }

    const diff = computeDiff(prevState, currState);

    res.json({
      projectId,
      from: commits.length >= 2 ? { commitId: commits[1].id, timestamp: commits[1].timestamp } : null,
      to: { commitId: commits[0].id, timestamp: commits[0].timestamp },
      diff,
    });
  } catch (err: any) {
    console.error('GET /projects/:id/diff error:', err);
    res.status(500).json({ error: 'Failed to compute diff.' });
  }
});

export default router;
