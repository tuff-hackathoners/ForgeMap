import { Router, Request, Response } from 'express';
import { ProjectModel } from '../models/Project';
import { RoadmapTaskModel, TaskStatus } from '../models/RoadmapTask';
import prisma from '../db/client';

const router = Router();

/**
 * PATCH /projects/:id/roadmap
 * Apply task-completion updates detected from a commit to the RoadmapTask rows.
 * Respects dependencies: a task cannot move to in_progress or completed if its
 * dependencies are not all completed. Blocked tasks stay blocked until deps clear.
 *
 * Body: { completedTasks: string[] }  — array of task titles (or IDs) the AI detected as done
 */
router.patch('/:id/roadmap', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.id as string;

    const project = await ProjectModel.findById(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    const { completedTasks } = req.body;
    if (!completedTasks || !Array.isArray(completedTasks)) {
      res.status(400).json({ error: 'Field "completedTasks" is required and must be an array of task titles or IDs.' });
      return;
    }

    const tasks = await RoadmapTaskModel.findByProjectId(projectId);

    // Build a lookup: id → task, title → task
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const taskByTitle = new Map(tasks.map((t) => [t.title, t]));

    // Parse dependencies (stored as JSON string)
    const parsedTasks = tasks.map((t) => ({
      ...t,
      depIds: JSON.parse(t.dependencies) as string[],
    }));

    // Determine which tasks the AI says are completed (match by title or ID)
    const toComplete = new Set<string>();
    for (const ref of completedTasks) {
      const byId = taskById.get(ref);
      const byTitle = taskByTitle.get(ref);
      const task = byId || byTitle;
      if (task) {
        toComplete.add(task.id);
      }
    }

    // Get current completed set (before this update)
    const alreadyCompleted = new Set(
      parsedTasks.filter((t) => t.status === 'completed').map((t) => t.id)
    );

    // Apply updates with dependency checks
    const updates: { id: string; oldStatus: string; newStatus: TaskStatus; reason: string }[] = [];
    const blocked: { id: string; title: string; reason: string }[] = [];

    for (const task of parsedTasks) {
      if (toComplete.has(task.id) && task.status !== 'completed') {
        // Check if all dependencies are completed
        const unmetDeps = task.depIds.filter(
          (depId) => !alreadyCompleted.has(depId) && !toComplete.has(depId)
        );

        if (unmetDeps.length > 0) {
          // Cannot complete — dependencies not met, mark as blocked
          if (task.status !== 'blocked') {
            await RoadmapTaskModel.updateStatus(task.id, 'blocked');
            blocked.push({
              id: task.id,
              title: task.title,
              reason: `Blocked: depends on unfinished tasks [${unmetDeps.join(', ')}]`,
            });
          } else {
            blocked.push({
              id: task.id,
              title: task.title,
              reason: `Still blocked: depends on [${unmetDeps.join(', ')}]`,
            });
          }
        } else {
          // All deps met — mark as completed
          await RoadmapTaskModel.updateStatus(task.id, 'completed');
          updates.push({
            id: task.id,
            oldStatus: task.status,
            newStatus: 'completed',
            reason: 'Dependencies satisfied, task completed.',
          });
          alreadyCompleted.add(task.id);
        }
      }
    }

    // Second pass: unblock tasks whose dependencies are now all completed
    for (const task of parsedTasks) {
      if (task.status === 'blocked' && !toComplete.has(task.id)) {
        const unmetDeps = task.depIds.filter((depId) => !alreadyCompleted.has(depId));
        if (unmetDeps.length === 0) {
          // Dependencies cleared — move to in_progress
          await RoadmapTaskModel.updateStatus(task.id, 'in_progress');
          updates.push({
            id: task.id,
            oldStatus: 'blocked',
            newStatus: 'in_progress',
            reason: 'Dependencies now satisfied, unblocked.',
          });
        }
      }
    }

    // Return updated roadmap
    const updatedTasks = await RoadmapTaskModel.findByProjectId(projectId);

    res.json({
      projectId,
      updates,
      blocked,
      roadmapTasks: updatedTasks.map(RoadmapTaskModel.serialize),
    });
  } catch (err: any) {
    console.error('PATCH /projects/:id/roadmap error:', err);
    res.status(500).json({ error: 'Failed to update roadmap.' });
  }
});

export default router;
