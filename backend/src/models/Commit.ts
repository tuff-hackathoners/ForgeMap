import prisma from '../db/client';
import crypto from 'crypto';

export interface CreateCommitInput {
  projectId: string;
  mediaUrl?: string;
  userNote?: string;
  detectedChanges?: object;
  projectState?: object;
  completedTasks?: string[];
  feedback?: object;
  roadmapState?: object;
}

export const CommitModel = {
  generateId(): string {
    return `commit_${crypto.randomUUID()}`;
  },

  async create(input: CreateCommitInput) {
    return prisma.commit.create({
      data: {
        id: CommitModel.generateId(),
        projectId: input.projectId,
        mediaUrl: input.mediaUrl ?? null,
        userNote: input.userNote ?? null,
        detectedChanges: input.detectedChanges ? JSON.stringify(input.detectedChanges) : null,
        projectState: input.projectState ? JSON.stringify(input.projectState) : null,
        completedTasks: input.completedTasks ? JSON.stringify(input.completedTasks) : null,
        feedback: input.feedback ? JSON.stringify(input.feedback) : null,
        roadmapState: input.roadmapState ? JSON.stringify(input.roadmapState) : null,
      },
    });
  },

  /** Create with a pre-generated ID (used when we need the ID for the filename before saving) */
  async createWithId(id: string, input: CreateCommitInput) {
    return prisma.commit.create({
      data: {
        id,
        projectId: input.projectId,
        mediaUrl: input.mediaUrl ?? null,
        userNote: input.userNote ?? null,
        detectedChanges: input.detectedChanges ? JSON.stringify(input.detectedChanges) : null,
        projectState: input.projectState ? JSON.stringify(input.projectState) : null,
        completedTasks: input.completedTasks ? JSON.stringify(input.completedTasks) : null,
        feedback: input.feedback ? JSON.stringify(input.feedback) : null,
        roadmapState: input.roadmapState ? JSON.stringify(input.roadmapState) : null,
      },
    });
  },

  async findByProjectId(projectId: string) {
    return prisma.commit.findMany({
      where: { projectId },
      orderBy: { timestamp: 'desc' },
    });
  },

  async findById(id: string) {
    return prisma.commit.findUnique({ where: { id } });
  },

  /** Parse JSON string fields back into objects for API responses */
  serialize(commit: any) {
    return {
      ...commit,
      detectedChanges: commit.detectedChanges ? JSON.parse(commit.detectedChanges) : null,
      projectState: commit.projectState ? JSON.parse(commit.projectState) : null,
      completedTasks: commit.completedTasks ? JSON.parse(commit.completedTasks) : null,
      feedback: commit.feedback ? JSON.parse(commit.feedback) : null,
      roadmapState: commit.roadmapState ? JSON.parse(commit.roadmapState) : null,
    };
  },
};
