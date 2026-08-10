# Frontend Integration Doc — Backend → Frontend Contract

> **From:** Person 2 (Backend)  
> **To:** Person 3 (Frontend)  
> **Date:** August 10, 2026  

---

## Quick Start

```bash
# Terminal 1 — AI service (port 5000)
cd ai_service
npm install
# Create .env with BACKBOARD_API_KEY (ask the team)
npm run dev

# Terminal 2 — Backend (port 4000)
cd backend
npm install
npx prisma db push
npm run dev
```

Frontend runs on `localhost:5173` — CORS is already configured for this.

---

## Core User Flow

```
1. User inputs idea → POST /projects → returns roadmap + materials + SVGs
2. User sees roadmap, starts building/designing
3. User uploads progress photo → POST /projects/:id/commits → returns analysis + next step SVG
4. App updates roadmap (tasks auto-complete), shows diff of what changed
5. Repeat steps 3-4 until project is complete
6. User generates final documentation → GET /projects/:id/documentation
```

---

## API Endpoints

All requests go to `http://localhost:4000`. All responses are JSON. Errors always return `{ "error": "message" }` with appropriate HTTP status codes.

---

### 1. `POST /projects` — Create a new project

**Request:**
```json
{
  "idea": "Build a 2 DOF phone holder with pan and tilt in Fusion 360 for 3D printing",
  "budget": 15,
  "skillLevel": "beginner"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| idea | string | YES | What the user wants to build (max 2000 chars) |
| budget | number | no | Target budget in USD |
| skillLevel | string | no | "beginner" / "intermediate" / "advanced" |
| tools | string[] | no | Tools user already has |
| deadline | string | no | Freeform deadline |

**Response (201):**
```json
{
  "project": {
    "id": "proj_xxxx-xxxx",
    "name": "2-DOF Pan/Tilt Phone Holder Arm (3D Printed)",
    "idea": "...",
    "budgetTarget": 15,
    "budgetActual": null,
    "skillLevel": "beginner",
    "createdAt": "2026-08-10T01:57:31.168Z",
    "roadmapTasks": [
      {
        "id": "task_xxxx",
        "projectId": "proj_xxxx",
        "title": "Model the Base (Part 1)",
        "description": "Cylindrical base, 60mm diameter x 10mm height...",
        "status": "not_started",
        "dependencies": [],
        "order": 1,
        "visualGuide": "Flat disc with raised center boss, M5 hole through center axis",
        "tips": ["Use revolve for concentricity", "Add 0.2mm to M5 hole"],
        "openscadCode": "$fn=80;\ndifference(){...}",   // task 1 ONLY (null for others)
        "svgProfile": "<svg viewBox='0 0 200 150'>...</svg>"  // task 1 ONLY (null for others)
      },
      {
        "id": "task_yyyy",
        "title": "Model the Pan Arm (Part 2)",
        "description": "...",
        "status": "not_started",
        "dependencies": ["Model the Base (Part 1)"],
        "order": 2,
        "visualGuide": "...",
        "tips": ["...", "..."],
        "openscadCode": null,
        "svgProfile": null
      }
    ]
  },
  "aiGenerated": {
    "overview": "A 4-part 3D-printed phone holder with independent pan and tilt rotation...",
    "assemblyDrawing": "<svg viewBox='0 0 300 200'>...full assembly diagram with part labels...</svg>",
    "materials": [
      { "item": "PLA filament", "quantity": 1, "estimatedCost": 5 },
      { "item": "M4x20mm bolt + nyloc nut", "quantity": 2, "estimatedCost": 2 }
    ],
    "totalEstimatedCost": 7.5,
    "tools": ["Fusion 360", "3D printer", "Calipers", "Hex key"],
    "instructions": ["Step 1...", "Step 2...", "⚠️ Safety note...", "..."],
    "fromAI": true
  }
}
```

**Key frontend features to build:**
- Render `assemblyDrawing` SVG as the hero "here's what you're building" image
- Render `roadmapTasks[0].svgProfile` as the "start here" part diagram
- Show `openscadCode` with a copy button (user pastes into OpenSCAD or openscad.org)
- Display `tips` as callout boxes per task
- Show `dependencies` as a DAG/graph or indented list
- `fromAI: false` means the AI service was down — show a "generic roadmap" warning banner
- `instructions` array may contain `⚠️` prefixed strings — render those as safety warnings

---

### 2. `GET /projects/:id` — Get full project

**Response (200):**
```json
{
  "id": "proj_xxxx",
  "name": "...",
  "idea": "...",
  "budgetTarget": 15,
  "budgetActual": null,
  "skillLevel": "beginner",
  "createdAt": "...",
  "roadmapTasks": [ /* same shape as above, with current statuses */ ],
  "commits": [
    {
      "id": "commit_xxxx",
      "projectId": "proj_xxxx",
      "timestamp": "2026-08-10T02:30:00.000Z",
      "mediaUrl": "/storage/proj_xxxx/commit_xxxx.jpg",
      "userNote": "Finished modeling the base plate",
      "detectedChanges": { "added": [...], "removed": [...], "modified": [...] },
      "projectState": { "components": [...], "completedTasks": [...], "remainingTasks": [...], "problems": [...] },
      "completedTasks": ["task_1_title"],
      "roadmapState": [{ "id": "task_xxxx", "title": "...", "status": "completed" }]
    }
  ]
}
```

**Notes:**
- `mediaUrl` is relative — prepend `http://localhost:4000` to get the full URL for `<img src>`
- `commits` are ordered newest-first (descending timestamp)
- `roadmapTasks[].status` is one of: `not_started` | `in_progress` | `completed` | `blocked`

---

### 3. `POST /projects/:id/commits` — Upload progress (THE CORE FEATURE)

**Request:** `multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| photo | file | no* | Image file (jpg/png/gif/webp/heic, max 20MB) |
| note | text | no* | User's text description of what they did |

*At least one of `photo` or `note` is required.

**Example (fetch):**
```javascript
const formData = new FormData();
formData.append('photo', fileInput.files[0]);
formData.append('note', 'Finished modeling the base plate in Fusion 360');

const res = await fetch(`http://localhost:4000/projects/${projectId}/commits`, {
  method: 'POST',
  body: formData,
});
```

**Response (201):**
```json
{
  "commit": {
    "id": "commit_xxxx",
    "projectId": "proj_xxxx",
    "timestamp": "2026-08-10T02:30:00.000Z",
    "mediaUrl": "/storage/proj_xxxx/commit_xxxx.jpg",
    "userNote": "Finished modeling the base plate",
    "detectedChanges": {
      "added": ["Base plate modeled (60mm dia x 10mm)"],
      "removed": [],
      "modified": []
    },
    "projectState": {
      "components": ["Base plate (complete)"],
      "completedTasks": ["Model the Base (Part 1)"],
      "remainingTasks": ["Model the Pan Arm", "..."],
      "problems": []
    },
    "completedTasks": ["Model the Base (Part 1)"],
    "roadmapState": [
      { "id": "task_xxxx", "title": "Model the Base (Part 1)", "status": "completed" },
      { "id": "task_yyyy", "title": "Model the Pan Arm (Part 2)", "status": "not_started" }
    ]
  },
  "analysis": {
    "summary": "Base plate modeling complete. 60mm disc with M4 bore, counterbore, and hex nut trap all visible.",
    "nextSteps": ["Model the Pan Arm next — the base bore defines the shared pivot axis"],
    "nextStep": {
      "taskId": "task_2",
      "reason": "Base is done, so the Pan Arm can reference its bore diameter for alignment",
      "svgGuide": "<svg viewBox='0 0 200 150'>...diagram of what task 2 looks like when done...</svg>",
      "openscadCode": "// Pan Arm\n$fn=80;\nunion(){...}"
    },
    "fromAI": true
  }
}
```

**Key frontend features:**
- Show the uploaded image alongside the AI's text analysis
- Render `analysis.nextStep.svgGuide` as "what to do next" diagram
- Show `analysis.nextStep.openscadCode` with copy button (for CAD projects)
- Update the roadmap view — tasks in `commit.completedTasks` should now show as ✅
- `analysis.fromAI: false` means vision analysis wasn't available (no photo, or AI service down) — the commit still saved, just without AI insights
- `analysis.nextStep` can be `null` if the AI couldn't determine a next step

---

### 4. `GET /projects/:id/commits` — List all commits

**Response (200):**
```json
{
  "projectId": "proj_xxxx",
  "count": 3,
  "commits": [ /* same commit shape as above, newest first */ ]
}
```

**Frontend:** Render as a Git-style timeline. Each commit shows:
- Timestamp
- Thumbnail of the photo (from `mediaUrl`)
- User's note
- AI summary of detected changes
- Which tasks were completed in this commit

---

### 5. `GET /projects/:id/state` — Current project state

**Response (200):**
```json
{
  "projectId": "proj_xxxx",
  "state": {
    "components": ["Base plate (complete)", "Pan Arm (modeled)"],
    "completedTasks": ["Model the Base", "Model the Pan Arm"],
    "remainingTasks": ["Model the Tilt Bracket", "..."],
    "problems": []
  },
  "commitId": "commit_xxxx",
  "timestamp": "2026-08-10T03:00:00.000Z"
}
```

---

### 6. `GET /projects/:id/diff` — What changed between latest two commits

**Response (200):**
```json
{
  "projectId": "proj_xxxx",
  "from": { "commitId": "commit_aaa", "timestamp": "..." },
  "to": { "commitId": "commit_bbb", "timestamp": "..." },
  "diff": {
    "added": {
      "components": ["Pan Arm (modeled)"],
      "completedTasks": ["Model the Pan Arm"],
      "problems": []
    },
    "removed": {
      "components": [],
      "completedTasks": [],
      "problems": []
    },
    "changed": {
      "tasksCompleted": ["Model the Pan Arm"],
      "tasksAdded": [],
      "tasksRemoved": []
    },
    "summary": {
      "componentsAdded": 1,
      "componentsRemoved": 0,
      "tasksCompleted": 1,
      "newProblems": 0,
      "resolvedProblems": 0
    }
  }
}
```

**Frontend:** Show a visual diff view — green for added, red for removed, yellow for changed.

---

### 7. `PATCH /projects/:id/roadmap` — Update roadmap (manual)

Typically called automatically by the commit flow, but can also be triggered manually.

**Request:**
```json
{
  "completedTasks": ["Model the Base (Part 1)", "Model the Pan Arm (Part 2)"]
}
```

Values can be task **titles** or task **IDs** — the backend matches both.

**Response (200):**
```json
{
  "projectId": "proj_xxxx",
  "updates": [
    { "id": "task_xxxx", "oldStatus": "not_started", "newStatus": "completed", "reason": "Dependencies satisfied" }
  ],
  "blocked": [
    { "id": "task_zzzz", "title": "Assemble all parts", "reason": "Blocked: depends on unfinished tasks [task_yyyy]" }
  ],
  "roadmapTasks": [ /* full updated task list */ ]
}
```

**Key behavior:**
- Tasks with unmet dependencies get **blocked** (status = `blocked`)
- When a blocking dependency is completed, downstream tasks auto-unblock → `in_progress`
- The response tells you exactly what changed and why

---

### 8. `GET /projects/:id/documentation` — Generate final docs

**Response (200):**
```json
{
  "projectId": "proj_xxxx",
  "documentation": {
    "title": "2-DOF Pan/Tilt Phone Holder Arm",
    "overview": "...",
    "finalResult": "...",
    "materials": [{ "item": "...", "quantity": 1, "actualCost": 5 }],
    "totalCost": 12,
    "tools": ["..."],
    "originalRoadmap": ["Task 1 title", "Task 2 title", "..."],
    "finalRoadmap": ["Task 1 title (completed)", "..."],
    "commitHistory": [
      { "timestamp": "...", "summary": "...", "changes": ["..."] }
    ],
    "designDecisions": [
      { "decision": "...", "reason": "...", "consequence": "..." }
    ],
    "problemsSolved": [
      { "problem": "...", "solution": "..." }
    ],
    "reproductionSteps": ["Step 1...", "Step 2...", "..."]
  },
  "metadata": {
    "generatedAt": "2026-08-10T04:00:00.000Z",
    "fromAI": true,
    "totalCommits": 5,
    "tasksCompleted": 6,
    "totalTasks": 6
  }
}
```

**Frontend:** Render as a printable/exportable document page. Include all commit images inline.

---

### 9. `GET /health` — Health check

**Response:** `{ "status": "ok", "timestamp": "..." }`

---

## Important Implementation Details

### Serving uploaded images

Images are served statically at:
```
http://localhost:4000/storage/{projectId}/{commitId}.jpg
```

The `mediaUrl` field in commits gives you the path (e.g., `/storage/proj_xxxx/commit_yyyy.jpg`). Prepend the backend base URL.

### SVG rendering

Several responses contain SVG strings. Render them with:
```jsx
<div dangerouslySetInnerHTML={{ __html: svgString }} />
```

Or parse and render with a library for safer handling. The SVGs use `viewBox` so they scale to any container width.

SVG locations:
- `aiGenerated.assemblyDrawing` — full assembly overview (on project creation)
- `roadmapTasks[0].svgProfile` — first task's part diagram (on project creation)
- `analysis.nextStep.svgGuide` — next task's diagram (on each commit)

### OpenSCAD code

For CAD projects, some responses include `openscadCode` strings. Display these in a code block with a "Copy" button. Users paste into:
- OpenSCAD desktop app
- https://openscad.org (web viewer)

Locations:
- `roadmapTasks[0].openscadCode` — first task (on project creation)
- `analysis.nextStep.openscadCode` — next task (on each commit)

Both are `null` for physical (non-CAD) build projects.

### The `fromAI` flag

Every AI-powered response includes `fromAI: boolean`:
- `true` — real AI analysis (Claude via Backboard)
- `false` — AI service was down, response is a generic fallback stub

When `fromAI: false`, consider showing a banner: *"AI analysis unavailable — showing basic tracking only. Your progress is still saved."*

### Roadmap task statuses

```
not_started → in_progress → completed
                ↓
              blocked (unmet dependencies)
                ↓
            in_progress (once deps are met)
```

Only the backend ever writes statuses. Frontend only reads.

### Error responses

Always this shape:
```json
{ "error": "Human-readable error message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad input (missing field, wrong type, empty commit) |
| 404 | Project/resource not found |
| 413 | File too large (max 20MB) |
| 500 | Server error (logged, never leaks stack traces) |

---

## Suggested Page Structure

| Page | Key endpoint | What to show |
|------|-------------|--------------|
| **Home / Create Project** | `POST /projects` | Idea input form + constraint fields → loading spinner → redirect to dashboard |
| **Project Dashboard** | `GET /projects/:id` | Overview, materials, assembly SVG, roadmap progress bar, recent commits |
| **Upload / Commit** | `POST /projects/:id/commits` | File picker + note textarea → submit → show analysis + next step SVG |
| **Commit History** | `GET /projects/:id/commits` | Git-style vertical timeline with thumbnails + summaries |
| **Diff View** | `GET /projects/:id/diff` | Side-by-side or inline diff (added/removed/changed) |
| **Roadmap View** | `GET /projects/:id` (roadmapTasks) | DAG or kanban of tasks with status badges + dependency arrows |
| **Final Documentation** | `GET /projects/:id/documentation` | Printable doc page with embedded images + export to PDF |

---

## Loading States

Some endpoints are slow because they call the AI service:

| Endpoint | Typical time | Show loading? |
|----------|-------------|---------------|
| `POST /projects` | 60-90s | Yes — "Generating your project plan..." with progress animation |
| `POST /projects/:id/commits` (with photo) | 30-60s | Yes — "Analyzing your progress..." |
| `POST /projects/:id/commits` (note only) | <1s | No (falls back to stub instantly) |
| `GET /projects/:id/documentation` | 30-60s | Yes — "Generating documentation..." |
| All other GET endpoints | <100ms | No |

---

## Testing Without the AI Service

If the AI service (`localhost:5000`) is not running, the backend still works — every response will have `fromAI: false` with generic stub data. The frontend can be fully built and tested against the backend alone.

---

## Sample curl Commands

```bash
# Create project
curl -X POST http://localhost:4000/projects \
  -H "Content-Type: application/json" \
  -d '{"idea": "Build a wooden bookshelf", "budget": 40, "skillLevel": "beginner"}'

# Upload a commit with photo
curl -X POST http://localhost:4000/projects/proj_xxxx/commits \
  -F "photo=@my-progress.jpg" \
  -F "note=Finished cutting all boards to size"

# Get project state
curl http://localhost:4000/projects/proj_xxxx

# Get commits
curl http://localhost:4000/projects/proj_xxxx/commits

# Get diff
curl http://localhost:4000/projects/proj_xxxx/diff

# Generate documentation
curl http://localhost:4000/projects/proj_xxxx/documentation
```

---

## Questions?

Backend source: `backend/src/`  
AI service source: `ai_service/src/`  
Test fixtures: `backend/test/fixtures/`  
This doc: `backend/FRONTEND_INTEGRATION.md`
