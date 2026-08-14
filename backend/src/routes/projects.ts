import { Router, Request, Response } from 'express';
import { ProjectModel } from '../models/Project';
import { RoadmapTaskModel } from '../models/RoadmapTask';
import { CommitModel } from '../models/Commit';
import { generateInitialProject } from '../services/aiClient';

const router = Router();

// POST /projects — Create a new project
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { idea, budget, skillLevel, tools, deadline, referenceImage } = req.body;

    if (!idea || typeof idea !== 'string') {
      res.status(400).json({ error: 'Field "idea" is required and must be a string.' });
      return;
    }

    if (idea.length > 2000) {
      res.status(400).json({ error: 'Field "idea" must be 2000 characters or less.' });
      return;
    }

    // Call AI service (falls back to stub if unreachable/malformed)
    const { result: aiResult, fromAI } = await generateInitialProject(idea, {
      budget,
      skillLevel,
      tools,
      deadline,
      referenceImage,
    });

    // Create the project (store AI-generated data for retrieval)
    const aiData = {
      overview: aiResult.overview,
      assemblyDrawing: aiResult.assemblyDrawing || null,
      materials: aiResult.materials,
      totalEstimatedCost: aiResult.totalEstimatedCost,
      tools: aiResult.tools,
      instructions: aiResult.instructions,
      fromAI,
    };

    const project = await ProjectModel.create({
      name: aiResult.name,
      idea,
      budgetTarget: budget ?? aiResult.totalEstimatedCost,
      skillLevel: skillLevel ?? 'beginner',
      aiData,
    });

    // Create roadmap tasks with metadata (tips, SVG, OpenSCAD)
    const tasks = await RoadmapTaskModel.createMany(
      project.id,
      aiResult.roadmap.map((step) => ({
        title: step.title,
        description: step.description,
        order: step.order,
        dependencies: step.dependencies,
        metadata: {
          visualGuide: step.visualGuide || null,
          tips: step.tips || [],
          openscadCode: step.openscadCode || null,
          svgProfile: step.svgProfile || null,
        },
      }))
    );

    // Return full response
    res.status(201).json({
      project: {
        ...project,
        roadmapTasks: tasks.map(RoadmapTaskModel.serialize),
      },
      aiGenerated: aiData,
    });
  } catch (err: any) {
    console.error('POST /projects error:', err);
    res.status(500).json({ error: 'Failed to create project.' });
  }
});

// GET /projects/:id — Get full project state
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const project = await ProjectModel.findById(id);

    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    // Serialize JSON fields
    const aiData = project.aiData ? JSON.parse(project.aiData) : null;
    res.json({
      ...project,
      aiData: undefined,
      roadmapTasks: project.roadmapTasks.map(RoadmapTaskModel.serialize),
      commits: project.commits.map(CommitModel.serialize),
      aiGenerated: aiData,
    });
  } catch (err: any) {
    console.error('GET /projects/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch project.' });
  }
});

export default router;
