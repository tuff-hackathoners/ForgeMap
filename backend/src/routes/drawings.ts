import { Router, Request, Response } from 'express';
import { ProjectModel } from '../models/Project';
import { RoadmapTaskModel } from '../models/RoadmapTask';
import prisma from '../db/client';

const router = Router();
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5000';

/**
 * POST /projects/:id/drawings
 * Generates assembly drawing SVG + first task SVG/OpenSCAD in a separate call.
 * Called by the frontend AFTER project creation to avoid blocking the initial response.
 */
router.post('/:id/drawings', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.id as string;

    const project = await ProjectModel.findById(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    // Call AI service to generate drawings
    const roadmapData = project.roadmapTasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      order: t.order,
    }));

    const response = await fetch(`${AI_SERVICE_URL}/generate-drawings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_title: project.name,
        roadmap: roadmapData,
      }),
      signal: AbortSignal.timeout(300000), // 5 min
    });

    if (!response.ok) {
      console.warn(`AI service returned ${response.status} for /generate-drawings.`);
      res.status(502).json({ error: 'Drawing generation failed.' });
      return;
    }

    const data: any = await response.json();

    // Update project's aiData with the assembly drawing
    const existingAiData = project.aiData ? JSON.parse(project.aiData) : {};
    existingAiData.assemblyDrawing = data.assembly_drawing || data.assemblyDrawing || null;
    await prisma.project.update({
      where: { id: projectId },
      data: { aiData: JSON.stringify(existingAiData) },
    });

    // Update first task's metadata with SVG + OpenSCAD
    const firstTask = project.roadmapTasks[0];
    if (firstTask) {
      const existingMeta = firstTask.metadata ? JSON.parse(firstTask.metadata) : {};
      existingMeta.svgProfile = data.first_task_svg || data.svgProfile || null;
      existingMeta.openscadCode = data.first_task_openscad || data.openscadCode || null;
      await prisma.roadmapTask.update({
        where: { id: firstTask.id },
        data: { metadata: JSON.stringify(existingMeta) },
      });
    }

    res.json({
      assemblyDrawing: existingAiData.assemblyDrawing,
      firstTaskSvg: data.first_task_svg || null,
      firstTaskOpenscad: data.first_task_openscad || null,
    });
  } catch (err: any) {
    console.error('POST /projects/:id/drawings error:', err.message);
    res.status(500).json({ error: 'Drawing generation failed.' });
  }
});

export default router;
