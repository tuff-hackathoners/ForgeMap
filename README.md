# Physical Git

**Build it. Commit it. Document it.**

Physical Git is an AI-powered platform that applies the Git model to physical projects. Describe what you want to build, get an AI-generated roadmap with technical drawings, then track your progress through photo uploads. Every update becomes a "commit" with AI-detected changes, automatic roadmap updates, and a running project history — so the physical artifact itself is the source of truth.

---

## How It Works

```
Idea → AI Roadmap → Build → Upload Photo → AI Analyzes Progress →
Roadmap Updates → Next Step → Repeat → Final Documentation
```

1. **Describe your project** — idea, budget, skill level
2. **Get an AI-generated plan** — materials, tools, step-by-step roadmap with dependency graph, technical SVG drawings, OpenSCAD code (for CAD projects)
3. **Build and upload progress** — photo or screenshot of your current state
4. **AI analyzes changes** — detects what's new, what's done, flags problems, generates the next step's guide drawing
5. **Repeat until complete** — roadmap auto-updates, tasks mark themselves done
6. **Generate documentation** — full project history with commit timeline, design decisions, reproduction steps

---

## Project Structure

```
ForgeMap/
├── src/                    # Frontend (Vite + TypeScript, vanilla)
│   ├── main.ts
│   └── styles.css
├── backend/                # Backend API (Express + Prisma + SQLite)
│   ├── src/
│   │   ├── index.ts        # Server entry, CORS, routes
│   │   ├── routes/         # REST endpoints
│   │   ├── models/         # Data access (Project, Commit, RoadmapTask)
│   │   ├── services/       # AI client, diff engine
│   │   ├── middleware/     # Multer upload handling
│   │   └── db/             # Prisma client
│   └── prisma/schema.prisma
├── ai_service/             # AI service (Node + Backboard/Claude)
│   └── src/
│       ├── server.js
│       └── routes/         # generate-project, analyze-progress, next-steps, generate-docs, generate-drawings
└── index.html
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### 1. Frontend (port 5173)
```bash
npm install
npm run dev
```

### 2. Backend (port 4000)
```bash
cd backend
npm install
npx prisma db push
npm run dev
```

### 3. AI Service (port 5000)
```bash
cd ai_service
npm install
# Create .env with your Backboard API key:
echo "PORT=5000" > .env
echo "BACKBOARD_API_KEY=your_key_here" >> .env
npm run dev
```

Open http://localhost:5173 — the frontend talks to the backend, which talks to the AI service.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/projects` | Create project from idea (AI generates roadmap) |
| GET | `/projects/:id` | Full project with tasks + commits |
| POST | `/projects/:id/commits` | Upload progress photo/note |
| GET | `/projects/:id/commits` | Commit history |
| GET | `/projects/:id/state` | Current project state |
| GET | `/projects/:id/diff` | Diff between last two commits |
| PATCH | `/projects/:id/roadmap` | Update task statuses (dependency-aware) |
| POST | `/projects/:id/drawings` | Generate SVG drawings (background) |
| GET | `/projects/:id/documentation` | Generate final project docs |

See `backend/FRONTEND_INTEGRATION.md` for full request/response schemas.

---

## Key Features

- **AI Project Generation** — Idea + constraints → full roadmap, BOM, instructions, technical drawings
- **Photo-Based Progress Tracking** — Upload a photo, AI detects what changed
- **Automatic Roadmap Updates** — Tasks auto-complete based on visual evidence
- **Dependency-Aware Scheduling** — Blocked tasks stay blocked until prerequisites are done
- **SVG Technical Drawings** — Assembly overview + per-task part diagrams (isometric)
- **OpenSCAD Code** — For CAD projects, renderable 3D geometry per part
- **Graceful Degradation** — Backend works without AI service (falls back to stubs)
- **Physical Diff Engine** — Deterministic comparison of project states
- **Final Documentation** — Auto-generated build history, design decisions, reproduction steps

---

## Architecture

```
Frontend (Vite)  →  Backend (Express)  →  AI Service (Backboard/Claude)
     :5173              :4000                    :5000
                           ↓
                    SQLite (Prisma)
                    File Storage (/storage)
```

- **Frontend** stores state in localStorage, renders SVGs inline, calls backend REST API
- **Backend** owns all data, generates IDs, manages roadmap logic, forwards to AI with graceful fallback
- **AI Service** wraps Backboard API (which proxies to Claude), handles image upload/indexing for vision analysis

---

## Project Types

The AI auto-detects project type from the idea description:

| Type | Trigger | Materials |
|------|---------|-----------|
| **CAD / 3D Print** | mentions "CAD", "Fusion 360", "FreeCAD", "3D print", "STL" | PLA filament, bolts, inserts |
| **Physical Build (small)** | desktop-scale items | 3D printing preferred |
| **Physical Build (large)** | furniture, structures | Wood, metal, fasteners |
| **Electronics** | mentions "Arduino", "circuit", "code" | Components, PCBs, wire |

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite, TypeScript (vanilla, no framework) |
| Backend | Express 5, TypeScript, Prisma, SQLite |
| AI | Backboard API → Claude Sonnet 5 |
| File Upload | Multer (memory storage → disk) |
| Dev Server | tsx (backend), node --watch (AI service) |

---

## Team

| Role | Responsibility |
|------|---------------|
| Person 1 (AI) | Prompt engineering, AI service, Backboard integration |
| Person 2 (Backend) | API, database, diff engine, routing, error handling |
| Person 3 (Frontend) | UI, state management, SVG rendering, UX |

---

## License

MIT
