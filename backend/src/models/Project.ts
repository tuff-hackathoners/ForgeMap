import prisma from '../db/client';
import crypto from 'crypto';

export interface CreateProjectInput {
  name: string;
  idea: string;
  budgetTarget?: number;
  skillLevel?: string;
  aiData?: object;
}

export const ProjectModel = {
  generateId(): string {
    return `proj_${crypto.randomUUID()}`;
  },

  async create(input: CreateProjectInput) {
    return prisma.project.create({
      data: {
        id: ProjectModel.generateId(),
        name: input.name,
        idea: input.idea,
        budgetTarget: input.budgetTarget ?? null,
        budgetActual: null,
        skillLevel: input.skillLevel ?? null,
        aiData: input.aiData ? JSON.stringify(input.aiData) : null,
      },
    });
  },

  async findById(id: string) {
    return prisma.project.findUnique({
      where: { id },
      include: {
        roadmapTasks: { orderBy: { order: 'asc' } },
        commits: { orderBy: { timestamp: 'desc' } },
      },
    });
  },

  async updateBudgetActual(id: string, budgetActual: number) {
    return prisma.project.update({
      where: { id },
      data: { budgetActual },
    });
  },
};
