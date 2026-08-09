# AI Service Contract — Backend ↔ AI Integration

> **From:** Person 2 (Backend)  
> **To:** Person 1 (AI)  
> **Date:** August 9, 2026  

---

## Overview

The backend calls your AI service over HTTP at the URL defined in `AI_SERVICE_URL` (default: `http://localhost:5000`). All communication is JSON. If your service is down or returns malformed data, the backend falls back to stub responses gracefully — but obviously we want the real thing for the demo.

You need to implement **3 endpoints**. Each receives a POST with a JSON body, and must return a JSON response matching the schemas below **exactly** (field names, types, nesting). Extra fields are fine — we'll ignore them. Missing or wrong-typed required fields will trigger fallback.

---

## Endpoint 1: `POST /generate-project`

**When it's called:** User submits their project idea on the frontend.

### Request Body

```json
{
  "idea": "Build a robotic arm with 3 degrees of freedom using servo motors",
  "budget": 80,
  "skillLevel": "intermediate",
  "tools": ["soldering iron", "3D printer"],
  "deadline": "5 days",
  "referenceImage": null
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| idea | string | YES | The user's project description |
| budget | number | no | Target budget in USD |
| skillLevel | string | no | "beginner" / "intermediate" / "advanced" |
| tools | string[] | no | Tools the user already has |
| deadline | string | no | Freeform deadline description |
| referenceImage | string | no | Base64-encoded reference image (future) |

### Required Response Shape

```typescript
{
  name: string;                    // Short project name
  overview: string;                // 2-3 sentence project overview
  materials: {
    item: string;
    quantity: number;
    estimatedCost: number;         // USD
  }[];
  totalEstimatedCost: number;      // Sum of material costs
  tools: string[];                 // Required tools
  roadmap: {
    title: string;                 // Task title (keep short, <80 chars)
    description: string;           // What to do in this step
    order: number;                 // 1-indexed sequential order
    dependencies: string[];        // Array of task titles this depends on (or empty [])
  }[];
  instructions: string[];          // Step-by-step guidance
}
```

### Example Response

```json
{
  "name": "3-DOF Servo Robotic Arm",
  "overview": "A desktop robotic arm with 3 degrees of freedom powered by SG90 servo motors, controlled by Arduino Uno.",
  "materials": [
    { "item": "Arduino Uno", "quantity": 1, "estimatedCost": 25 },
    { "item": "SG90 Servo Motor", "quantity": 3, "estimatedCost": 12 },
    { "item": "3D Printed Arm Links", "quantity": 1, "estimatedCost": 15 },
    { "item": "Breadboard + Jumper Wires", "quantity": 1, "estimatedCost": 8 }
  ],
  "totalEstimatedCost": 60,
  "tools": ["Soldering iron", "3D printer", "Screwdriver set"],
  "roadmap": [
    {
      "title": "Print arm segments",
      "description": "3D print the base, shoulder, elbow, and gripper segments.",
      "order": 1,
      "dependencies": []
    },
    {
      "title": "Assemble arm structure",
      "description": "Connect printed segments with servo horns and screws.",
      "order": 2,
      "dependencies": ["Print arm segments"]
    },
    {
      "title": "Wire servos to Arduino",
      "description": "Connect servo signal wires to PWM pins, power to 5V rail.",
      "order": 3,
      "dependencies": ["Assemble arm structure"]
    },
    {
      "title": "Upload control code",
      "description": "Write and upload Arduino sketch for basic position control.",
      "order": 4,
      "dependencies": ["Wire servos to Arduino"]
    },
    {
      "title": "Calibrate and test",
      "description": "Adjust servo limits, test full range of motion.",
      "order": 5,
      "dependencies": ["Upload control code"]
    }
  ],
  "instructions": [
    "Start by printing all arm segments — they take the longest.",
    "Test-fit servos in their mounts before final assembly.",
    "Wire one servo at a time and test with a sweep sketch.",
    "Use the serial monitor to find exact angle limits for each joint."
  ]
}
```

---

## Endpoint 2: `POST /analyze-progress`

**When it's called:** User uploads a photo or text note after doing physical work.

### Request Body

```json
{
  "image": "<base64-encoded image data>",
  "imageFormat": "base64",
  "userNote": "Finished printing all arm segments and started assembly.",
  "currentState": {
    "roadmapTasks": [
      { "id": "task_abc123", "title": "Print arm segments", "status": "not_started", "dependencies": [] },
      { "id": "task_def456", "title": "Assemble arm structure", "status": "not_started", "dependencies": ["task_abc123"] }
    ],
    "commits": []
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| image | string | no | Base64-encoded photo (may be null if text-only update) |
| imageFormat | string | no | Always "base64" when image is present |
| userNote | string | no | User's description of what they did |
| currentState | object | YES | Current roadmap tasks + previous commits for context |

### Required Response Shape

```typescript
{
  detectedChanges: {
    added: string[];       // New things that appeared
    removed: string[];     // Things that are gone
    modified: string[];    // Things that changed
  };
  projectState: {
    components: string[];       // All currently visible/existing components
    completedTasks: string[];   // Task TITLES that are now done (must match roadmap titles exactly!)
    remainingTasks: string[];   // Task titles still to do
    problems: string[];         // Any issues detected
  };
  completedTasks: string[];     // Same as projectState.completedTasks (top-level for easy access)
  nextSteps: string[];          // Specific recommended next actions (2-4 items)
  summary: string;              // 1-2 sentence summary of what changed
}
```

### CRITICAL: `completedTasks` must match roadmap task titles exactly!

The backend uses these strings to look up tasks by title and mark them as completed. If the title doesn't match exactly (case-sensitive), the task won't be updated.

Given the `currentState.roadmapTasks` array in the request, return task titles from there verbatim.

### Example Response

```json
{
  "detectedChanges": {
    "added": ["3D printed arm segments (base, shoulder, elbow, gripper)"],
    "removed": [],
    "modified": ["Assembly started — shoulder segment attached to base"]
  },
  "projectState": {
    "components": [
      "Base segment (printed)",
      "Shoulder segment (printed, mounted)",
      "Elbow segment (printed)",
      "Gripper segment (printed)"
    ],
    "completedTasks": ["Print arm segments"],
    "remainingTasks": [
      "Assemble arm structure",
      "Wire servos to Arduino",
      "Upload control code",
      "Calibrate and test"
    ],
    "problems": []
  },
  "completedTasks": ["Print arm segments"],
  "nextSteps": [
    "Attach servo motors to shoulder and elbow joints",
    "Secure with servo horn screws — don't overtighten on PLA",
    "Test-fit gripper mechanism before permanent attachment"
  ],
  "summary": "All arm segments successfully printed. Assembly has begun with the shoulder mounted to the base. Ready to continue mechanical assembly."
}
```

---

## Endpoint 3: `POST /generate-documentation`

**When it's called:** User clicks "Generate Documentation" after project is complete (or in progress).

### Request Body

```json
{
  "project": {
    "id": "proj_abc123",
    "name": "3-DOF Servo Robotic Arm",
    "idea": "Build a robotic arm with 3 degrees of freedom using servo motors",
    "budgetTarget": 80,
    "budgetActual": null,
    "skillLevel": "intermediate",
    "createdAt": "2026-08-09T06:00:00.000Z"
  },
  "commits": [
    {
      "id": "commit_xxx",
      "timestamp": "2026-08-09T07:00:00.000Z",
      "mediaUrl": "/storage/proj_abc123/commit_xxx.jpg",
      "userNote": "Printed all segments",
      "detectedChanges": { "added": [...], "removed": [], "modified": [] },
      "projectState": { "components": [...], "completedTasks": [...], ... },
      "completedTasks": ["Print arm segments"]
    }
  ],
  "roadmapTasks": [
    { "id": "task_abc", "title": "Print arm segments", "status": "completed", "order": 1, "dependencies": [] },
    { "id": "task_def", "title": "Assemble arm structure", "status": "in_progress", "order": 2, "dependencies": ["task_abc"] }
  ]
}
```

### Required Response Shape

```typescript
{
  title: string;                   // Document title
  overview: string;                // Project summary paragraph
  finalResult: string;             // What was ultimately built
  materials: {
    item: string;
    quantity: number;
    actualCost?: number;           // Optional actual cost
  }[];
  totalCost: number;
  tools: string[];
  originalRoadmap: string[];       // Original plan as ordered list
  finalRoadmap: string[];          // What actually happened
  commitHistory: {
    timestamp: string;
    summary: string;
    changes: string[];
  }[];
  designDecisions: {
    decision: string;
    reason: string;
    consequence: string;
  }[];
  problemsSolved: {
    problem: string;
    solution: string;
  }[];
  reproductionSteps: string[];     // How to build this from scratch
}
```

### Minimum validation (what the backend checks):

```typescript
data && typeof data === 'object' && typeof data.title === 'string' && typeof data.overview === 'string'
```

So at minimum return `{ title, overview }` and fill in the rest as you have context for. The backend won't reject responses with missing optional sections — it just needs `title` and `overview` to pass validation.

---

## Quick Reference

| Endpoint | Timeout | Key Gotcha |
|----------|---------|------------|
| POST /generate-project | 30s | `roadmap[].dependencies` are task **titles**, not IDs |
| POST /analyze-progress | 60s | `completedTasks` must be **exact title matches** from the request's currentState |
| POST /generate-documentation | 60s | Just needs `title` + `overview` minimum to pass validation |

---

## How to test locally

1. Start your AI service on port 5000
2. Start the backend: `cd backend && npm run dev`
3. The backend will automatically call your service instead of using stubs
4. Check backend console — if it says "Falling back to stub" your response failed validation

---

## Questions?

The source code for how I call + validate your responses is in:  
`backend/src/services/aiClient.ts`

The TypeScript interfaces at the top of that file are the authoritative schema.
