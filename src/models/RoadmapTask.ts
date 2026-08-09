import prisma from '../db/client';
import crypto from 'crypto';

export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked';

export interface CreateRoadmapTaskInput {
  projectId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  dependencies?: string[];
  order?: number;
}

export const RoadmapTaskModel = {
  generateId(): string {
    return `task_${crypto.randomUUID()}`;
  },

  async create(input: CreateRoadmapTaskInput) {
    return prisma.roadmapTask.create({
      data: {
        id: RoadmapTaskModel.generateId(),
        projectId: input.projectId,
        title: input.title,
        description: input.description ?? '',
        status: input.status ?? 'not_started',
        dependencies: JSON.stringify(input.dependencies ?? []),
        order: input.order ?? 0,
      },
    });
  },

  async createMany(projectId: string, tasks: Omit<CreateRoadmapTaskInput, 'projectId'>[]) {
    const results = [];
    for (const task of tasks) {
      const created = await RoadmapTaskModel.create({ ...task, projectId });
      results.push(created);
    }
    return results;
  },

  async findByProjectId(projectId: string) {
    return prisma.roadmapTask.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  },

  async updateStatus(id: string, status: TaskStatus) {
    return prisma.roadmapTask.update({
      where: { id },
      data: { status },
    });
  },

  /** Parse JSON string fields back into arrays for API responses */
  serialize(task: any) {
    return {
      ...task,
      dependencies: task.dependencies ? JSON.parse(task.dependencies) : [],
    };
  },
};
