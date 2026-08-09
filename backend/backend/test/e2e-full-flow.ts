/**
 * Full end-to-end test with error scenarios:
 * 1. Create project (AI fallback since service is not running)
 * 2. Error: bad upload (no photo/note)
 * 3. Error: missing project
 * 4. Upload commit with photo + note
 * 5. Upload second commit (note only, no photo)
 * 6. GET /state — verify latest state
 * 7. GET /diff — verify diff between commits
 * 8. PATCH /roadmap — complete tasks
 * 9. GET /documentation — generate docs (AI fallback)
 * 10. Error: bad file type upload
 * 11. CORS headers check
 */

const BASE = 'http://localhost:4000';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${msg}`);
    failed++;
  } else {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  }
}

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' PHYSICAL GIT — Full E2E Test (with error scenarios)');
  console.log('══════════════════════════════════════════════════\n');

  // ─── 1. Health check ───
  console.log('─── 1. Health check ───');
  const health = await fetch(`${BASE}/health`);
  const healthData = await health.json();
  assert(health.status === 200, `Health returns 200`);
  assert(healthData.status === 'ok', `Health status is "ok"`);
  assert(!!healthData.timestamp, `Health includes timestamp`);

  // ─── 2. Create project (AI service not running → graceful fallback) ───
  console.log('\n─── 2. Create project (AI fallback) ───');
  const createRes = await fetch(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idea: 'Build a robotic arm with 3 degrees of freedom using servo motors',
      budget: 80,
      skillLevel: 'intermediate',
    }),
  });
  const createData = await createRes.json();
  assert(createRes.status === 201, `POST /projects returns 201 (got ${createRes.status})`);
  assert(!!createData.project.id, `Project has an ID: ${createData.project.id}`);
  assert(createData.project.roadmapTasks.length > 0, `Project has roadmap tasks`);
  assert(createData.aiGenerated.fromAI === false, `Response indicates fallback was used (fromAI: false)`);

  const projectId = createData.project.id;

  // ─── 3. Error: missing idea field ───
  console.log('\n─── 3. Error: missing "idea" field ───');
  const badCreate = await fetch(`${BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ budget: 50 }),
  });
  const badCreateData = await badCreate.json();
  assert(badCreate.status === 400, `Missing idea returns 400 (got ${badCreate.status})`);
  assert(badCreateData.error.includes('idea'), `Error mentions "idea": ${badCreateData.error}`);

  // ─── 4. Error: project not found ───
  console.log('\n─── 4. Error: project not found ───');
  const notFound = await fetch(`${BASE}/projects/proj_nonexistent`);
  assert(notFound.status === 404, `Nonexistent project returns 404 (got ${notFound.status})`);

  // ─── 5. Error: commit with no photo and no note ───
  console.log('\n─── 5. Error: commit with no photo and no note ───');
  const emptyCommit = await fetch(`${BASE}/projects/${projectId}/commits`, {
    method: 'POST',
    body: new FormData(),
  });
  const emptyCommitData = await emptyCommit.json();
  assert(emptyCommit.status === 400, `Empty commit returns 400 (got ${emptyCommit.status})`);
  assert(emptyCommitData.error.includes('photo or a note'), `Error explains requirement`);

  // ─── 6. Create commit with photo ───
  console.log('\n─── 6. Create commit with photo + note ───');
  const formData = new FormData();
  // Create a minimal JPEG-like blob for testing
  const fakeJpeg = new Blob([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])], { type: 'image/jpeg' });
  formData.append('photo', fakeJpeg, 'progress-1.jpg');
  formData.append('note', 'Assembled the base plate and attached three servo mounts.');

  const commit1Res = await fetch(`${BASE}/projects/${projectId}/commits`, {
    method: 'POST',
    body: formData,
  });
  const commit1Data = await commit1Res.json();
  assert(commit1Res.status === 201, `Commit with photo returns 201 (got ${commit1Res.status})`);
  assert(!!commit1Data.commit.id, `Commit has ID: ${commit1Data.commit.id}`);
  assert(!!commit1Data.commit.mediaUrl, `Commit has mediaUrl: ${commit1Data.commit.mediaUrl}`);
  assert(commit1Data.analysis.fromAI === false, `Analysis indicates fallback (fromAI: false)`);
  assert(!!commit1Data.analysis.summary, `Analysis has summary`);

  // ─── 7. Create commit with note only (no photo) ───
  console.log('\n─── 7. Create commit with note only ───');
  const noteForm = new FormData();
  noteForm.append('note', 'Wired up the first servo motor and tested range of motion. 180 degrees works fine.');

  const commit2Res = await fetch(`${BASE}/projects/${projectId}/commits`, {
    method: 'POST',
    body: noteForm,
  });
  const commit2Data = await commit2Res.json();
  assert(commit2Res.status === 201, `Note-only commit returns 201 (got ${commit2Res.status})`);
  assert(commit2Data.commit.mediaUrl === null, `No mediaUrl for note-only commit`);
  assert(!!commit2Data.commit.userNote, `User note preserved`);

  // ─── 8. GET /state ───
  console.log('\n─── 8. GET /projects/:id/state ───');
  const stateRes = await fetch(`${BASE}/projects/${projectId}/state`);
  const stateData = await stateRes.json();
  assert(stateRes.status === 200, `GET /state returns 200`);
  assert(stateData.projectId === projectId, `State references correct project`);
  assert(stateData.commitId === commit2Data.commit.id, `State references latest commit`);
  assert(!!stateData.state, `State object present`);

  // ─── 9. GET /diff ───
  console.log('\n─── 9. GET /projects/:id/diff ───');
  const diffRes = await fetch(`${BASE}/projects/${projectId}/diff`);
  const diffData = await diffRes.json();
  assert(diffRes.status === 200, `GET /diff returns 200`);
  assert(diffData.from !== null, `Diff has "from" (previous commit)`);
  assert(diffData.to !== null, `Diff has "to" (latest commit)`);
  assert(!!diffData.diff, `Diff result present`);
  assert(diffData.diff.summary !== undefined, `Diff has summary stats`);

  // ─── 10. GET /commits list ───
  console.log('\n─── 10. GET /projects/:id/commits ───');
  const listRes = await fetch(`${BASE}/projects/${projectId}/commits`);
  const listData = await listRes.json();
  assert(listRes.status === 200, `GET /commits returns 200`);
  assert(listData.count === 2, `Two commits total (got ${listData.count})`);
  assert(listData.commits[0].timestamp >= listData.commits[1].timestamp, `Commits ordered by timestamp desc`);

  // ─── 11. PATCH /roadmap ───
  console.log('\n─── 11. PATCH /projects/:id/roadmap ───');
  const roadmapRes = await fetch(`${BASE}/projects/${projectId}/roadmap`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completedTasks: [createData.project.roadmapTasks[0].title] }),
  });
  const roadmapData = await roadmapRes.json();
  assert(roadmapRes.status === 200, `PATCH /roadmap returns 200`);
  assert(roadmapData.updates.length > 0, `At least one update applied`);
  assert(roadmapData.roadmapTasks.some((t: any) => t.status === 'completed'), `At least one task now completed`);

  // ─── 12. GET /documentation ───
  console.log('\n─── 12. GET /projects/:id/documentation ───');
  const docRes = await fetch(`${BASE}/projects/${projectId}/documentation`);
  const docData = await docRes.json();
  assert(docRes.status === 200, `GET /documentation returns 200`);
  assert(!!docData.documentation, `Documentation object present`);
  assert(!!docData.documentation.title, `Documentation has title`);
  assert(docData.metadata.fromAI === false, `Documentation used fallback (fromAI: false)`);
  assert(docData.metadata.totalCommits === 2, `Metadata shows 2 commits`);
  assert(docData.metadata.tasksCompleted >= 1, `Metadata shows completed tasks`);

  // ─── 13. CORS check ───
  console.log('\n─── 13. CORS headers ───');
  const corsRes = await fetch(`${BASE}/health`, {
    headers: { Origin: 'http://localhost:5173' },
  });
  const corsHeader = corsRes.headers.get('access-control-allow-origin');
  assert(corsHeader === 'http://localhost:5173' || corsHeader === '*', `CORS allows localhost:5173 (got: ${corsHeader})`);

  // ─── 14. Error: commit on nonexistent project ───
  console.log('\n─── 14. Error: commit on nonexistent project ───');
  const badCommitForm = new FormData();
  badCommitForm.append('note', 'This should fail');
  const badCommit = await fetch(`${BASE}/projects/proj_fake/commits`, {
    method: 'POST',
    body: badCommitForm,
  });
  assert(badCommit.status === 404, `Commit on bad project returns 404 (got ${badCommit.status})`);

  // ─── 15. Error: PATCH /roadmap with bad body ───
  console.log('\n─── 15. Error: PATCH /roadmap with bad body ───');
  const badRoadmap = await fetch(`${BASE}/projects/${projectId}/roadmap`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wrong: 'field' }),
  });
  assert(badRoadmap.status === 400, `Bad roadmap body returns 400 (got ${badRoadmap.status})`);

  // ─── Summary ───
  console.log('\n══════════════════════════════════════════════════');
  console.log(` Results: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
