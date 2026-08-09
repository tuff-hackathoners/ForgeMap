/**
 * Focused test: dependency blocking logic
 * Creates a project, manually sets dependencies on tasks via Prisma,
 * then verifies PATCH /roadmap correctly blocks/unblocks.
 */

import prisma from '../src/db/client';
import crypto from 'crypto';

const BASE = 'http://localhost:4000';

async function patch(path: string, body: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, data: await res.json() };
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${msg}`);
}

async function main() {
  console.log('\n=== Dependency Blocking Test ===\n');

  // Create project directly in DB
  const projectId = `proj_${crypto.randomUUID()}`;
  await prisma.project.create({
    data: {
      id: projectId,
      name: 'Dep Test',
      idea: 'Test dependency blocking',
      budgetTarget: 10,
      skillLevel: 'beginner',
    },
  });

  // Create tasks with explicit dependency chain:
  // task1 (no deps) → task2 (depends on task1) → task3 (depends on task2) → task4 (depends on task2 + task3)
  const task1Id = `task_${crypto.randomUUID()}`;
  const task2Id = `task_${crypto.randomUUID()}`;
  const task3Id = `task_${crypto.randomUUID()}`;
  const task4Id = `task_${crypto.randomUUID()}`;

  await prisma.roadmapTask.createMany({
    data: [
      { id: task1Id, projectId, title: 'Foundation', description: 'Build the base', status: 'not_started', dependencies: '[]', order: 1 },
      { id: task2Id, projectId, title: 'Walls', description: 'Build walls on foundation', status: 'not_started', dependencies: JSON.stringify([task1Id]), order: 2 },
      { id: task3Id, projectId, title: 'Roof', description: 'Add roof on walls', status: 'not_started', dependencies: JSON.stringify([task2Id]), order: 3 },
      { id: task4Id, projectId, title: 'Interior', description: 'Finish interior', status: 'not_started', dependencies: JSON.stringify([task2Id, task3Id]), order: 4 },
    ],
  });

  console.log(`  Created project ${projectId} with 4 dependency-linked tasks`);
  console.log(`  Chain: Foundation → Walls → Roof → Interior`);
  console.log(`  Interior depends on BOTH Walls and Roof\n`);

  // ─── Test 1: Try to complete "Walls" before "Foundation" — should be BLOCKED ───
  console.log('--- Test 1: Complete "Walls" before "Foundation" → should BLOCK ---');
  const { data: res1 } = await patch(`/projects/${projectId}/roadmap`, {
    completedTasks: ['Walls'],
  });
  assert(res1.blocked.length > 0, `"Walls" was blocked (unmet dep: Foundation)`);
  assert(res1.updates.filter((u: any) => u.newStatus === 'completed').length === 0, 'No tasks were completed');
  console.log(`  Blocked reason: ${res1.blocked[0].reason}`);

  // ─── Test 2: Complete "Foundation" (no deps) — should succeed ───
  console.log('\n--- Test 2: Complete "Foundation" (no deps) → should SUCCEED ---');
  const { data: res2 } = await patch(`/projects/${projectId}/roadmap`, {
    completedTasks: ['Foundation'],
  });
  assert(res2.updates.some((u: any) => u.newStatus === 'completed'), '"Foundation" completed');
  // "Walls" was blocked — it should now be unblocked (moved to in_progress)
  const wallsUnblocked = res2.updates.find((u: any) => u.id === task2Id && u.newStatus === 'in_progress');
  assert(wallsUnblocked !== undefined, '"Walls" was unblocked (moved to in_progress)');
  console.log(`  Foundation: completed`);
  console.log(`  Walls: unblocked → in_progress`);

  // ─── Test 3: Now complete "Walls" — should succeed ───
  console.log('\n--- Test 3: Complete "Walls" → should SUCCEED ---');
  const { data: res3 } = await patch(`/projects/${projectId}/roadmap`, {
    completedTasks: ['Walls'],
  });
  assert(res3.updates.some((u: any) => u.id === task2Id && u.newStatus === 'completed'), '"Walls" completed');
  console.log(`  Walls: completed`);

  // ─── Test 4: Try to complete "Interior" (depends on Walls + Roof) — Walls done but Roof not ───
  console.log('\n--- Test 4: Complete "Interior" (needs Walls+Roof, Roof not done) → should BLOCK ---');
  const { data: res4 } = await patch(`/projects/${projectId}/roadmap`, {
    completedTasks: ['Interior'],
  });
  assert(res4.blocked.length > 0, '"Interior" was blocked (Roof not done)');
  console.log(`  Blocked reason: ${res4.blocked[0].reason}`);

  // ─── Test 5: Complete "Roof" (depends on Walls which is done) — should succeed ───
  console.log('\n--- Test 5: Complete "Roof" (Walls done) → should SUCCEED ---');
  const { data: res5 } = await patch(`/projects/${projectId}/roadmap`, {
    completedTasks: ['Roof'],
  });
  assert(res5.updates.some((u: any) => u.id === task3Id && u.newStatus === 'completed'), '"Roof" completed');
  // Interior was blocked — should now unblock
  const interiorUnblocked = res5.updates.find((u: any) => u.id === task4Id && u.newStatus === 'in_progress');
  assert(interiorUnblocked !== undefined, '"Interior" was unblocked (moved to in_progress)');
  console.log(`  Roof: completed`);
  console.log(`  Interior: unblocked → in_progress`);

  // ─── Test 6: Now complete "Interior" — should succeed ───
  console.log('\n--- Test 6: Complete "Interior" (all deps done) → should SUCCEED ---');
  const { data: res6 } = await patch(`/projects/${projectId}/roadmap`, {
    completedTasks: ['Interior'],
  });
  assert(res6.updates.some((u: any) => u.id === task4Id && u.newStatus === 'completed'), '"Interior" completed');
  console.log(`  Interior: completed`);

  // ─── Final: All tasks should be completed ───
  console.log('\n--- Final: Verify all tasks completed ---');
  const { data: finalData } = await get(`/projects/${projectId}`);
  const allCompleted = finalData.roadmapTasks.every((t: any) => t.status === 'completed');
  assert(allCompleted, 'All 4 tasks are completed');

  finalData.roadmapTasks.forEach((t: any) => {
    console.log(`  ${t.order}. [${t.status}] ${t.title} (deps: ${JSON.stringify(t.dependencies)})`);
  });

  // Clean up
  await prisma.$disconnect();

  console.log('\n=== ALL DEPENDENCY TESTS PASSED ===\n');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
