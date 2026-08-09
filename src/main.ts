import "./styles.css";

type View = "dashboard" | "create" | "roadmap" | "update" | "history" | "diff" | "docs";
type Status = "completed" | "current" | "upcoming" | "blocked";

type RoadmapNode = {
  id: string;
  title: string;
  status: Status;
  x: number;
  y: number;
  time: string;
  materials: string;
  instructions: string;
};

type Commit = {
  id: string;
  title: string;
  date: string;
  progress: number;
  image?: string;
  note: string;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
  completed: string[];
  decisions: string[];
  problems: string[];
  nextStep: string;
};

type Project = {
  id: string;
  name: string;
  idea: string;
  budget: number;
  spent: number;
  skill: string;
  deadline: string;
  milestone: string;
  nextStep: string;
  problems: string[];
};

type AppState = {
  view: View;
  project: Project | null;
  roadmap: RoadmapNode[];
  commits: Commit[];
  selectedCommitId: string;
  selectedNodeId: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const STORAGE_KEY = "physical-git-state";
let placeholderTimers: number[] = [];

const emptyState: AppState = {
  view: "create",
  project: null,
  roadmap: [],
  commits: [],
  selectedCommitId: "",
  selectedNodeId: "",
};

const state: AppState = loadState();

const statusLabel: Record<Status, string> = {
  completed: "Completed",
  current: "Current",
  upcoming: "Upcoming",
  blocked: "Blocked",
};

const edges = [
  ["plan", "materials"],
  ["materials", "first-build"],
  ["first-build", "core-assembly"],
  ["core-assembly", "branch-a"],
  ["core-assembly", "branch-b"],
  ["branch-a", "test"],
  ["branch-b", "test"],
];

function loadState(): AppState {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(emptyState);
  try {
    const parsed = JSON.parse(saved) as AppState;
    return parsed.project ? parsed : structuredClone(emptyState);
  } catch {
    return structuredClone(emptyState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function el<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[T] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });
}

function project() {
  if (!state.project) throw new Error("Project has not been created.");
  return state.project;
}

function progress() {
  return state.commits[0]?.progress ?? 0;
}

function selectedCommit() {
  return state.commits.find((commit) => commit.id === state.selectedCommitId) ?? state.commits[0];
}

function selectedNode() {
  return state.roadmap.find((node) => node.id === state.selectedNodeId) ?? state.roadmap[0];
}

function render() {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;
  placeholderTimers.forEach((timer) => window.clearTimeout(timer));
  placeholderTimers = [];
  app.innerHTML = "";
  app.append(renderShell());
  bindActions();
}

function renderShell() {
  const shell = el("main", "app-shell");
  shell.append(renderNav());

  const workspace = el("section", "workspace");
  const views: View[] = state.project
    ? ["dashboard", "create", "roadmap", "update", "history", "diff", "docs"]
    : ["create"];

  views.forEach((view) => {
    const screen = el("section", `screen ${state.view === view ? "active-screen" : ""}`);
    screen.dataset.view = view;
    screen.append(renderView(view));
    workspace.append(screen);
  });

  shell.append(workspace);
  return shell;
}

function renderNav() {
  const nav = el("nav", "nav");
  const navItems: Array<[View, string]> = [
    ["dashboard", "Dashboard"],
    ["roadmap", "Roadmap"],
    ["update", "Update"],
    ["history", "History"],
    ["diff", "Diff"],
    ["docs", "Docs"],
  ];

  nav.innerHTML = `
    <div class="brand"><span></span><strong>Forgemap</strong></div>
    <div class="nav-links">
      ${
        state.project
          ? navItems
              .map(
                ([view, label]) =>
                  `<button class="${state.view === view ? "active" : ""}" data-view="${view}" type="button">${label}</button>`,
              )
              .join("")
          : ""
      }
    </div>
    ${
      state.project
        ? `<button type="button" id="reset-project" class="secondary">New Project</button>`
        : `<span></span>`
    }
  `;
  return nav;
}

function renderView(view: View) {
  if (!state.project && view !== "create") return renderCreateProject();
  if (view === "create") return renderCreateProject();
  if (view === "dashboard") return renderDashboard();
  if (view === "roadmap") return renderRoadmap();
  if (view === "update") return renderUpdate();
  if (view === "history") return renderHistory();
  if (view === "diff") return renderDiff();
  return renderDocs();
}

function renderCreateProject() {
  const p = state.project;
  const section = el("section", "section-grid");
  section.innerHTML = `
    <article class="panel create-panel">
      <div class="section-head">
        <div>
          <span>${p ? "Create Another Project" : "Create Project"}</span>
          <h1>${p ? "Start a new build record." : "What are you building?"}</h1>
          <p>${p ? "This will replace the local project in this browser." : "Describe a real physical project and Physical Git will generate a working roadmap, progress tracker, and documentation space."}</p>
        </div>
        ${p ? `<button type="button" data-view="dashboard" class="secondary">Cancel</button>` : ""}
      </div>
      <form id="create-form" class="create-form">
        <div class="field">
          <span class="form-label">Project title<span class="required">*</span></span>
          <input id="project-title" name="title" type="text" required />
        </div>
        <div class="field">
          <span class="form-label">What do you want to build?<span class="required">*</span></span>
          <textarea id="project-idea" name="idea" rows="5" required></textarea>
        </div>
        <div class="form-row">
          <div class="field">
            <span class="form-label">Budget<span class="required">*</span></span>
            <input id="project-budget" name="budget" type="text" />
          </div>
          <div class="field">
            <span class="form-label">Deadline</span>
            <div class="date-field">
              <input id="project-deadline" name="deadline" type="date" />
              <span class="date-placeholder">mm/dd/yyyy</span>
            </div>
          </div>
        </div>
        <div class="field">
          <span class="form-label">References</span>
          <label class="upload-strip">
            <input id="reference-input" type="file" accept="image/*" />
            <span class="upload-icon">+</span>
            <span id="reference-name">Add files</span>
          </label>
        </div>
        <button type="submit">Generate Project</button>
      </form>
    </article>
  `;
  return section;
}

function renderDashboard() {
  const p = project();
  const commit = selectedCommit();
  const section = el("div", "dashboard-view");
  section.innerHTML = `
    <section class="hero-grid">
      <article class="hero-card">
        <div class="eyebrow">Home Dashboard</div>
        <h1>${escapeHtml(p.name)}</h1>
        <p class="hero-copy">${escapeHtml(p.idea)}</p>
        <div class="hero-actions">
          <button type="button" data-view="update">Update Project</button>
          <button type="button" data-view="docs" class="secondary">View Documentation</button>
        </div>
        <div class="answer-grid">
          <div><span>Built</span><strong>${commit?.completed[0] ?? "Project roadmap"}</strong></div>
          <div><span>Changed</span><strong>${commit?.modified[0] ?? "No progress uploaded yet"}</strong></div>
          <div><span>Next</span><strong>${escapeHtml(p.nextStep)}</strong></div>
        </div>
      </article>
      <aside class="status-card">
        <div class="progress-ring" aria-label="${progress()} percent complete" style="--progress:${progress() * 3.6}deg">
          <span>${progress()}%</span>
        </div>
        <div>
          <p>Current milestone</p>
          <h2>${escapeHtml(p.milestone)}</h2>
        </div>
        <div class="budget-bar">
          <div><span>Budget</span><strong>$${p.spent} / $${p.budget}</strong></div>
          <i><b style="width:${Math.min(100, (p.spent / p.budget) * 100)}%"></b></i>
        </div>
        <button type="button" data-view="roadmap" class="problem-pill">${p.problems.length} active problems</button>
      </aside>
      <aside class="next-card">
        <div class="eyebrow">AI Recommended Next Step</div>
        <h2>${escapeHtml(p.nextStep)}</h2>
        <p>Progress updates drive this recommendation. Users follow practical build guidance without needing Git concepts.</p>
      </aside>
    </section>
  `;
  section.append(renderRoadmap(), renderHistory(), renderProblems());
  return section;
}

function renderRoadmap() {
  const section = el("section", "section-grid roadmap-section");
  const byId = new Map(state.roadmap.map((node) => [node.id, node]));
  const lines = edges
    .map(([from, to]) => {
      const start = byId.get(from);
      const end = byId.get(to);
      return start && end ? `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" />` : "";
    })
    .join("");

  section.innerHTML = `
    <article class="panel roadmap-panel">
      <div class="section-head">
        <div>
          <span>Roadmap</span>
          <h2>Build path</h2>
        </div>
        <button type="button" data-view="update" class="secondary">Update progress</button>
      </div>
      <div class="graph">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
        ${state.roadmap
          .map(
            (node) => `
          <button class="node ${node.status} ${node.id === state.selectedNodeId ? "selected" : ""}" data-node="${node.id}" style="left:${node.x}%; top:${node.y}%" type="button">
            <small>${statusLabel[node.status]}</small>
            <strong>${escapeHtml(node.title)}</strong>
            <span>${escapeHtml(node.time)}</span>
          </button>`,
          )
          .join("")}
      </div>
    </article>
    ${renderRoadmapDetails().outerHTML}
  `;
  return section;
}

function renderRoadmapDetails() {
  const node = selectedNode();
  const aside = el("aside", "panel checklist");
  aside.innerHTML = `
    <div class="section-head compact">
      <div>
        <span>Task Details</span>
        <h2>${escapeHtml(node.title)}</h2>
      </div>
    </div>
    <div class="task-focus ${node.status}">
      <strong>${statusLabel[node.status]}</strong>
      <p>${escapeHtml(node.instructions)}</p>
      <p>Materials: ${escapeHtml(node.materials)}</p>
      <p>Estimated time: ${escapeHtml(node.time)}</p>
    </div>
    ${state.roadmap
      .map(
        (task) => `
      <details ${task.id === state.selectedNodeId ? "open" : ""} class="${task.status}">
        <summary>
          <b></b>
          <strong>${escapeHtml(task.title)}</strong>
          <span>${statusLabel[task.status]}</span>
        </summary>
        <p>${escapeHtml(task.instructions)}</p>
        <p>Materials: ${escapeHtml(task.materials)}</p>
      </details>`,
      )
      .join("")}
  `;
  return aside;
}

function renderUpdate() {
  const commit = selectedCommit();
  const section = el("section", "section-grid update-grid");
  section.innerHTML = `
    <article class="panel update-panel">
      <div class="section-head">
        <div>
          <span>Update Project</span>
          <h2>Upload a real progress photo.</h2>
        </div>
      </div>
      <form id="update-form">
        <label class="dropzone">
          <input id="photo-input" name="file" type="file" accept="image/*" />
          <strong>Choose photo, camera upload, or screenshot</strong>
          <span id="file-name">No file selected</span>
        </label>
        <label>
          <span>Optional notes</span>
          <textarea id="note-input" name="note" rows="4" placeholder="What changed since the last update?"></textarea>
        </label>
        <button type="submit">Analyze Progress Update</button>
      </form>
    </article>
    ${commit ? renderCommitDetails(commit).outerHTML : renderEmptyDetails().outerHTML}
    ${renderHistory("timeline-panel").outerHTML}
  `;
  return section;
}

function renderEmptyDetails() {
  const panel = el("article", "panel commit-detail");
  panel.innerHTML = `
    <div class="section-head compact">
      <div>
        <span>Progress Update Details</span>
        <h2>No uploads yet</h2>
      </div>
    </div>
    <p>Upload a photo or screenshot to create the first progress update.</p>
  `;
  return panel;
}

function renderCommitDetails(commit: Commit) {
  const panel = el("article", "panel commit-detail");
  panel.innerHTML = `
    <div class="section-head compact">
      <div>
        <span>Progress Update Details</span>
        <h2>${escapeHtml(commit.title)}</h2>
      </div>
      <button type="button" data-view="diff" class="secondary">View diff</button>
    </div>
    ${commit.image ? `<img src="${commit.image}" alt="${escapeHtml(commit.title)}" />` : ""}
    <div class="analysis-grid">
      <div><span>Added</span><strong>${commit.added.join(", ") || "None"}</strong></div>
      <div><span>Modified</span><strong>${commit.modified.join(", ") || "None"}</strong></div>
      <div><span>Completed</span><strong>${commit.completed.join(", ") || "None"}</strong></div>
      <div><span>Problems</span><strong>${commit.problems.join(", ") || "None"}</strong></div>
    </div>
    <p class="decision">Design decision: ${escapeHtml(commit.decisions[0] ?? "No decision recorded yet.")}</p>
    <p class="decision">Next step: ${escapeHtml(commit.nextStep)}</p>
  `;
  return panel;
}

function renderHistory(extraClass = "") {
  const section = el("article", `panel ${extraClass || "history-view"}`);
  section.innerHTML = `
    <div class="section-head compact">
      <div>
        <span>History</span>
        <h2>Progress updates</h2>
      </div>
    </div>
    <div class="timeline">
      ${
        state.commits.length
          ? state.commits
              .map(
                (item) => `
        <button type="button" class="timeline-item ${item.id === state.selectedCommitId ? "selected" : ""}" data-commit="${item.id}">
          ${item.image ? `<img src="${item.image}" alt="${escapeHtml(item.title)}" />` : "<span></span>"}
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.date)}</span>
            <p>${escapeHtml(item.summary)}</p>
          </div>
          <b>${item.progress}%</b>
        </button>`,
              )
              .join("")
          : "<p>No progress updates yet.</p>"
      }
    </div>
  `;
  return section;
}

function renderProblems() {
  const panel = el("article", "panel problems-panel");
  panel.innerHTML = `
    <div class="section-head compact">
      <div>
        <span>Active Problems</span>
        <h2>Needs attention</h2>
      </div>
      <button type="button" data-view="update" class="secondary">Resolve with upload</button>
    </div>
    <div class="doc-list">
      ${project().problems.map((problem) => `<span>${escapeHtml(problem)}</span>`).join("") || "<span>No active problems</span>"}
    </div>
  `;
  return panel;
}

function renderDiff() {
  const current = selectedCommit();
  if (!current) return renderEmptyDetails();
  const previous = state.commits[state.commits.findIndex((commit) => commit.id === current.id) + 1] ?? current;
  const section = el("section", "section-grid bottom-grid");
  section.innerHTML = `
    <article class="panel diff-panel">
      <div class="section-head">
        <div>
          <span>Diff View</span>
          <h2>Previous vs current physical state.</h2>
        </div>
        <button type="button" data-view="history" class="secondary">Choose update</button>
      </div>
      <div class="diff-images">
        <figure>
          ${previous.image ? `<img src="${previous.image}" alt="Previous project state" />` : "<div class=\"empty-image\">No previous image</div>"}
          <figcaption>Previous</figcaption>
        </figure>
        <figure>
          ${current.image ? `<img src="${current.image}" alt="Current project state" />` : "<div class=\"empty-image\">No image</div>"}
          <i class="highlight one"></i>
          <i class="highlight two"></i>
          <figcaption>Current</figcaption>
        </figure>
      </div>
      <div class="diff-tags">
        ${current.added.map((item) => `<span>+ ${escapeHtml(item)}</span>`).join("")}
        ${current.modified.map((item) => `<span>~ ${escapeHtml(item)}</span>`).join("")}
        ${current.removed.map((item) => `<span>- ${escapeHtml(item)}</span>`).join("")}
      </div>
    </article>
    ${renderCommitDetails(current).outerHTML}
  `;
  return section;
}

function renderDocs() {
  const markdown = generateMarkdown();
  const section = el("section", "section-grid bottom-grid");
  section.innerHTML = `
    <article class="panel docs-panel">
      <div class="section-head">
        <div>
          <span>Documentation</span>
          <h2>Export the build record.</h2>
        </div>
      </div>
      <div class="doc-list">
        <span>Project overview</span>
        <span>Build timeline</span>
        <span>Materials / BOM</span>
        <span>Design decisions</span>
        <span>Problems & solutions</span>
        <span>Final specifications</span>
      </div>
      <div class="export-row">
        <button type="button" id="copy-docs">Copy Markdown</button>
        <button type="button" id="download-docs" class="secondary">Download .md</button>
      </div>
    </article>
    <article class="panel doc-preview">
      <div class="section-head compact">
        <div>
          <span>Preview</span>
          <h2>Generated Markdown</h2>
        </div>
      </div>
      <pre>${escapeHtml(markdown)}</pre>
    </article>
  `;
  return section;
}

function generateMarkdown() {
  const p = project();
  return `# ${p.name}

${p.idea}

## Current Status
- Progress: ${progress()}%
- Current milestone: ${p.milestone}
- Next step: ${p.nextStep}
- Budget: $${p.spent} / $${p.budget}

## Roadmap
${state.roadmap.map((task) => `- ${statusLabel[task.status]}: ${task.title} (${task.time})`).join("\n")}

## Build Timeline
${state.commits
  .map(
    (commit) => `### ${commit.title}
${commit.date}

${commit.summary}

Note: ${commit.note}
Added: ${commit.added.join(", ") || "None"}
Modified: ${commit.modified.join(", ") || "None"}
Problems: ${commit.problems.join(", ") || "None"}
Decision: ${commit.decisions.join(", ") || "None"}`,
  )
  .join("\n\n")}
`;
}

function bindActions() {
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach((control) => {
    control.addEventListener("click", (event) => event.stopPropagation());
    control.addEventListener("keydown", (event) => event.stopPropagation());
  });

  document.querySelectorAll<HTMLElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextView = button.dataset.view as View;
      state.view = state.project ? nextView : "create";
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-node]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedNodeId = button.dataset.node!;
      saveState();
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-commit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCommitId = button.dataset.commit!;
      state.view = "update";
      saveState();
      render();
    });
  });

  document.querySelector("#reset-project")?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, structuredClone(emptyState));
    render();
  });

  bindCreateForm();
  bindUpdateForm();
  bindDocs();
  bindDatePlaceholder();
}

function bindCreateForm() {
  const form = document.querySelector<HTMLFormElement>("#create-form");
  const reference = document.querySelector<HTMLInputElement>("#reference-input");
  const referenceName = document.querySelector<HTMLElement>("#reference-name");
  startPlaceholderLoops();

  reference?.addEventListener("change", () => {
    referenceName!.textContent = reference.files?.[0]?.name ?? "Optional reference image.";
  });

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const title = String(data.get("title") || "").trim();
    const idea = String(data.get("idea") || "").trim();
    const budget = Number(String(data.get("budget") || "0").replace(/[^0-9.]/g, "")) || 0;
    if (!title || !idea || !budget) {
      toast("Add a title, build description, and budget first.");
      return;
    }

    const roadmap = generateRoadmap(idea);

    state.project = {
      id: `proj_${crypto.randomUUID()}`,
      name: title,
      idea,
      budget,
      spent: 0,
      skill: "Not specified",
      deadline: String(data.get("deadline") || "No deadline"),
      milestone: roadmap[0].title,
      nextStep: roadmap[0].instructions,
      problems: [],
    };
    state.roadmap = roadmap;
    state.commits = [
      {
        id: `commit_${crypto.randomUUID()}`,
        title: "Project generated",
        date: formatDate(),
        progress: 8,
        note: idea,
        summary: "Roadmap, materials, budget, and first instructions were generated.",
        added: ["Project roadmap", "Budget", "Initial documentation"],
        modified: [],
        removed: [],
        completed: [],
        decisions: ["Project created from the initial build description."],
        problems: [],
        nextStep: state.project.nextStep,
      },
    ];
    state.selectedCommitId = state.commits[0].id;
    state.selectedNodeId = roadmap[0].id;
    state.view = "dashboard";
    saveState();
    toast("Project created.");
    render();
  });
}

function startPlaceholderLoops() {
  const fields = [
    {
      el: document.querySelector<HTMLInputElement>("#project-title"),
      phrases: ["Small rover", "Desk air quality monitor", "Solar phone charger", "Hydroponic grow box"],
      speed: 0.62,
    },
    {
      el: document.querySelector<HTMLTextAreaElement>("#project-idea"),
      phrases: [
        "I want to build a small rover that can avoid obstacles.",
        "I want to use spare sensors to track room temperature.",
        "I want to make a portable charger for camping.",
        "I want to turn a rough sketch into a working prototype.",
      ],
      speed: 1,
    },
    {
      el: document.querySelector<HTMLInputElement>("#project-budget"),
      phrases: ["$50", "$100", "$200", "$500"],
      speed: 0.48,
    },
  ].filter(
    (field): field is { el: HTMLInputElement | HTMLTextAreaElement; phrases: string[]; speed: number } =>
      Boolean(field.el),
  );

  if (!fields.length) return;
  let phraseIndex = 0;
  let charIndex = 0;
  let deleting = false;

  const tick = () => {
    fields.forEach(({ el, phrases, speed }) => {
      el.placeholder = phrases[phraseIndex].slice(0, Math.floor(charIndex * speed));
    });

    const longestPhraseLength = Math.max(...fields.map(({ phrases }) => phrases[phraseIndex].length));

    if (deleting) {
      charIndex -= 1;
      if (charIndex <= 0) {
        deleting = false;
        phraseIndex = (phraseIndex + 1) % fields[0].phrases.length;
      }
    } else {
      charIndex += 1;
      if (charIndex > longestPhraseLength) {
        deleting = true;
        const holdTimer = window.setTimeout(tick, 1200);
        placeholderTimers.push(holdTimer);
        return;
      }
    }

    const timer = window.setTimeout(tick, deleting ? 28 : 42);
    placeholderTimers.push(timer);
  };

  tick();
}

function bindDatePlaceholder() {
  const input = document.querySelector<HTMLInputElement>("#project-deadline");
  if (!input) return;
  const update = () => input.classList.toggle("has-value", Boolean(input.value));
  input.addEventListener("input", update);
  input.addEventListener("change", update);
  update();
}

function bindUpdateForm() {
  const form = document.querySelector<HTMLFormElement>("#update-form");
  const input = document.querySelector<HTMLInputElement>("#photo-input");
  const fileName = document.querySelector<HTMLElement>("#file-name");

  input?.addEventListener("change", () => {
    fileName!.textContent = input.files?.[0]?.name ?? "No file selected";
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = input?.files?.[0];
    if (!file) {
      toast("Choose a photo or screenshot first.");
      return;
    }

    const note = String(new FormData(form).get("note") || "Uploaded a progress photo.");
    const image = URL.createObjectURL(file);
    const commit = makeCommit(note, image);
    state.commits.unshift(commit);
    state.selectedCommitId = commit.id;
    advanceRoadmap();
    const p = project();
    p.spent = p.budget ? Math.min(p.budget, p.spent + Math.ceil(p.budget * 0.08)) : p.spent;
    p.milestone = selectedNode().title;
    p.nextStep = commit.nextStep;
    p.problems = commit.problems;
    state.view = "update";
    saveState();

    try {
      const payload = new FormData(form);
      payload.set("file", file);
      await fetch(`${API_BASE}/projects/${p.id}/commits`, { method: "POST", body: payload });
    } catch {
      // Local-first behavior keeps the frontend usable without the backend.
    }

    toast("Progress update added.");
    render();
  });
}

function bindDocs() {
  document.querySelector("#copy-docs")?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(generateMarkdown());
    toast("Markdown copied.");
  });

  document.querySelector("#download-docs")?.addEventListener("click", () => {
    const blob = new Blob([generateMarkdown()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project().name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

function titleFromIdea(idea: string) {
  return idea
    .replace(/^i want to build\s+/i, "")
    .replace(/^build\s+/i, "")
    .replace(/\s+(under|for less than|by|before)\s+.+$/i, "")
    .split(/\s+/)
    .slice(0, 5)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function generateRoadmap(idea: string): RoadmapNode[] {
  const objectName = titleFromIdea(idea).toLowerCase() || "project";
  return [
    {
      id: "plan",
      title: "Define build requirements",
      status: "current",
      x: 7,
      y: 50,
      time: "20 min",
      materials: "Project idea, constraints, reference notes",
      instructions: `Confirm what the ${objectName} must do, what success looks like, and what constraints matter.`,
    },
    {
      id: "materials",
      title: "Gather materials",
      status: "upcoming",
      x: 23,
      y: 50,
      time: "30-60 min",
      materials: "Parts, tools, fasteners, safety equipment",
      instructions: "Collect the required materials and upload a photo so Physical Git can verify what is available.",
    },
    {
      id: "first-build",
      title: "Assemble first version",
      status: "upcoming",
      x: 39,
      y: 50,
      time: "1-2 hr",
      materials: "Core components",
      instructions: "Build the simplest working version before adding polish or optional branches.",
    },
    {
      id: "core-assembly",
      title: "Core assembly",
      status: "upcoming",
      x: 55,
      y: 50,
      time: "1 hr",
      materials: "Primary structure and functional parts",
      instructions: "Connect the main functional pieces and upload a clear progress photo.",
    },
    {
      id: "branch-a",
      title: "Feature branch",
      status: "upcoming",
      x: 72,
      y: 25,
      time: "45 min",
      materials: "Optional feature parts",
      instructions: "Add the first optional feature only after the core assembly is stable.",
    },
    {
      id: "branch-b",
      title: "Enclosure branch",
      status: "upcoming",
      x: 72,
      y: 74,
      time: "1 hr",
      materials: "Case, mount, frame, or finishing materials",
      instructions: "Build the enclosure or final physical mounting once dimensions are confirmed.",
    },
    {
      id: "test",
      title: "Test and document",
      status: "blocked",
      x: 90,
      y: 50,
      time: "30 min",
      materials: "Final photos, test notes, measurements",
      instructions: "Test the finished build, resolve visible issues, and generate documentation.",
    },
  ];
}

function makeCommit(note: string, image: string): Commit {
  const nextProgress = Math.min(100, progress() + 14);
  const currentTask = selectedNode();
  return {
    id: `commit_${crypto.randomUUID()}`,
    title: `${currentTask.title} update`,
    date: formatDate(),
    progress: nextProgress,
    image,
    note,
    summary: "Physical Git analyzed the uploaded progress image and updated the build record.",
    added: ["New progress evidence"],
    modified: ["Roadmap status", currentTask.title],
    removed: [],
    completed: nextProgress > 20 ? [currentTask.title] : [],
    decisions: [note],
    problems: nextProgress > 70 ? [] : ["Upload another angle after completing the next task."],
    nextStep:
      nextProgress >= 100
        ? "Generate final documentation."
        : "Complete the highlighted roadmap task and upload the next progress photo.",
  };
}

function advanceRoadmap() {
  const currentIndex = state.roadmap.findIndex((node) => node.status === "current");
  state.roadmap = state.roadmap.map((node, index) => {
    if (index <= currentIndex) return { ...node, status: "completed" };
    if (index === currentIndex + 1) return { ...node, status: "current" };
    if (node.status === "blocked" && progress() > 60) return { ...node, status: "upcoming" };
    return node;
  });
  const next = state.roadmap.find((node) => node.status === "current") ?? state.roadmap[state.roadmap.length - 1];
  state.selectedNodeId = next.id;
}

function formatDate() {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date());
}

function toast(message: string) {
  document.querySelector(".toast")?.remove();
  const node = el("div", "toast", message);
  document.body.append(node);
  window.setTimeout(() => node.remove(), 3200);
}

render();
