import { Router, Request, Response } from 'express';
import { ProjectModel } from '../models/Project';
import { CommitModel } from '../models/Commit';
import { RoadmapTaskModel } from '../models/RoadmapTask';
import { generateDocumentation } from '../services/aiClient';

const router = Router();

/**
 * GET /projects/:id/documentation
 * Pulls full commit history and project state, calls the AI service
 * to generate comprehensive project documentation.
 */
router.get('/:id/documentation', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.id as string;

    const project = await ProjectModel.findById(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    // Get all commits with parsed JSON
    const rawCommits = await CommitModel.findByProjectId(projectId);
    const commits = rawCommits.map(CommitModel.serialize);

    // Get roadmap tasks with parsed JSON
    const rawTasks = await RoadmapTaskModel.findByProjectId(projectId);
    const roadmapTasks = rawTasks.map(RoadmapTaskModel.serialize);

    // Call AI to generate documentation (falls back to stub if unavailable)
    const { result: documentation, fromAI } = await generateDocumentation(
      {
        id: project.id,
        name: project.name,
        idea: project.idea,
        budgetTarget: project.budgetTarget,
        budgetActual: project.budgetActual,
        skillLevel: project.skillLevel,
        createdAt: project.createdAt,
      },
      commits,
      roadmapTasks
    );

    res.json({
      projectId,
      documentation,
      metadata: {
        generatedAt: new Date().toISOString(),
        fromAI,
        totalCommits: commits.length,
        tasksCompleted: roadmapTasks.filter((t: any) => t.status === 'completed').length,
        totalTasks: roadmapTasks.length,
      },
    });
  } catch (err: any) {
    console.error('GET /projects/:id/documentation error:', err);
    res.status(500).json({ error: 'Failed to generate documentation.' });
  }
});

export default router;
