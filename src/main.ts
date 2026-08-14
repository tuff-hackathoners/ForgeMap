import "./styles.css";

type Route = "create" | "dashboard" | "roadmap" | "update" | "history" | "diff" | "docs";
type RoadmapStatus = "not_started" | "in_progress" | "completed" | "blocked";

type RoadmapTask = {
  id: string;
  projectId?: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  dependencies: string[];
  order: number;
  visualGuide?: string;
  tips?: string[];
  openscadCode?: string | null;
  svgProfile?: string | null;
};

type Material = {
  item: string;
  quantity: number;
  estimatedCost?: number;
  actualCost?: number;
};

type Project = {
  id: string;
  name: string;
  idea: string;
  budgetTarget?: number | null;
  budgetActual?: number | null;
  skillLevel?: string | null;
  createdAt: string;
  roadmapTasks: RoadmapTask[];
};

type AiGenerated = {
  overview: string;
  assemblyDrawing?: string | null;
  materials: Material[];
  totalEstimatedCost?: number | null;
  tools: string[];
  instructions: string[];
  fromAI: boolean;
};

type Commit = {
  id: string;
  projectId: string;
  timestamp: string;
  mediaUrl?: string | null;
  userNote?: string | null;
  detectedChanges: { added: string[]; removed: string[]; modified: string[] };
  projectState: {
    components: string[];
    completedTasks: string[];
    remainingTasks: string[];
    problems: string[];
  };
  completedTasks: string[];
  roadmapState?: Array<{ id: string; title: string; status: RoadmapStatus }>;
};

type CommitAnalysis = {
  summary: string;
  nextSteps: string[];
  nextStep?: {
    taskId?: string;
    reason: string;
    svgGuide?: string | null;
    openscadCode?: string | null;
  } | null;
  fromAI: boolean;
};

type Documentation = {
  title: string;
  overview: string;
  finalResult: string;
  materials: Material[];
  totalCost?: number | null;
  tools: string[];
  originalRoadmap: string[];
  finalRoadmap: string[];
  commitHistory: Array<{ timestamp: string; summary: string; changes: string[] }>;
  designDecisions: Array<{ decision: string; reason: string; consequence: string }>;
  problemsSolved: Array<{ problem: string; solution: string }>;
  reproductionSteps: string[];
};

type ProjectBundle = {
  project: Project;
  aiGenerated: AiGenerated;
  commits: Commit[];
  lastAnalysis?: CommitAnalysis;
  documentation?: Documentation;
};

type AppState = {
  route: Route;
  bundle: ProjectBundle | null;
  selectedTaskId: string;
  selectedCommitId: string;
  notice: string;
  busy: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const STORAGE_KEY = "forgemap.frontend.state.v2";
let placeholderTimers: number[] = [];

const state: AppState = loadState();

function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyState();
    const parsed = JSON.parse(saved) as AppState;
    return parsed && "bundle" in parsed ? parsed : emptyState();
  } catch {
    return emptyState();
  }
}

function emptyState(): AppState {
  return { route: "create", bundle: null, selectedTaskId: "", selectedCommitId: "", notice: "", busy: "" };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]!);
}

function mediaUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("blob:") || path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error ?? "Request failed");
  }
  return response.json();
}

function project() {
  if (!state.bundle) throw new Error("No project loaded");
  return state.bundle.project;
}

function tasks() {
  return state.bundle?.project.roadmapTasks ?? [];
}

function commits() {
  return state.bundle?.commits ?? [];
}

function progressPercent() {
  const all = tasks();
  if (!all.length) return 0;
  return Math.round((all.filter((task) => task.status === "completed").length / all.length) * 100);
}

function currentTask() {
  return tasks().find((task) => task.status === "in_progress") ?? tasks().find((task) => task.status === "not_started") ?? tasks()[0];
}

function selectedTask() {
  return tasks().find((task) => task.id === state.selectedTaskId) ?? currentTask();
}

function selectedCommit() {
  return commits().find((commit) => commit.id === state.selectedCommitId) ?? commits()[0];
}

function setRoute(route: Route) {
  state.route = state.bundle ? route : "create";
  history.pushState(null, "", `#${state.route}`);
  saveState();
  render();
}

function render() {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;
  placeholderTimers.forEach((timer) => clearTimeout(timer));
  placeholderTimers = [];
  app.innerHTML = "";
  app.append(renderNav(), renderMain());
  bindActions();
}

function renderNav() {
  const nav = document.createElement("nav");
  nav.className = "nav";
  const items: Array<[Route, string]> = [
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
      ${state.bundle ? items.map(([route, label]) => `<button type="button" data-route="${route}" class="${state.route === route ? "active" : ""}">${label}</button>`).join("") : ""}
    </div>
    ${state.bundle ? `<button type="button" id="new-project" class="secondary">New Project</button>` : `<span></span>`}
  `;
  return nav;
}

function renderMain() {
  const main = document.createElement("main");
  main.className = "workspace";
  if (state.notice) main.append(renderNotice(state.notice));
  if (state.busy) main.append(renderBusy(state.busy));

  if (!state.bundle || state.route === "create") main.append(renderCreatePage());
  else if (state.route === "roadmap") main.append(renderRoadmapPage());
  else if (state.route === "update") main.append(renderUpdatePage());
  else if (state.route === "history") main.append(renderHistoryPage());
  else if (state.route === "diff") main.append(renderDiffPage());
  else if (state.route === "docs") main.append(renderDocsPage());
  else main.append(renderDashboardPage());
  return main;
}

function renderNotice(message: string) {
  const div = document.createElement("div");
  div.className = "notice";
  div.innerHTML = `<span>${escapeHtml(message)}</span><button type="button" data-clear-notice>Dismiss</button>`;
  return div;
}

function renderBusy(message: string) {
  const div = document.createElement("div");
  div.className = "busy";
  div.innerHTML = `<span></span><strong>${escapeHtml(message)}</strong>`;
  return div;
}

function renderCreatePage(compact = false) {
  const section = document.createElement("section");
  section.className = compact ? "create-page compact-create" : "create-page";
  section.innerHTML = `
    <header class="page-head">
      <span>Create Project</span>
      <h1>What are you building?</h1>
      <p>Describe a real project. Forgemap will generate a roadmap, materials, instructions, and a place to track progress updates.</p>
    </header>
    <form class="create-form" novalidate>
      <div class="field">
        <span class="form-label">Project title<span class="required">*</span></span>
        <input name="title" data-placeholder="title" type="text" autocomplete="off" />
      </div>
      <div class="field">
        <span class="form-label">What do you want to build?<span class="required">*</span></span>
        <textarea name="idea" data-placeholder="idea" rows="5"></textarea>
      </div>
      <div class="form-row">
        <div class="field">
          <span class="form-label">Budget<span class="required">*</span></span>
          <input name="budget" data-placeholder="budget" type="text" inputmode="decimal" autocomplete="off" />
        </div>
        <div class="field">
          <span class="form-label">Deadline</span>
          <div class="date-field">
            <input name="deadline" type="date" />
            <span class="date-placeholder">mm/dd/yyyy</span>
          </div>
        </div>
      </div>
      <div class="field">
        <span class="form-label">References</span>
        <label class="upload-strip">
          <input name="reference" type="file" accept="image/*,.pdf" />
          <span class="upload-icon">+</span>
          <span data-reference-name>Add files</span>
          <small class="drop-hint">Drag and drop files here, or click to browse</small>
        </label>
      </div>
      <button type="button" data-create-project>Generate Project</button>
    </form>
  `;
  return section;
}

function renderDashboardPage() {
  const bundle = state.bundle!;
  const p = bundle.project;
  const active = currentTask();
  const recent = commits()[0];
  const article = document.createElement("section");
  article.className = "dashboard-page";
  article.innerHTML = `
    <header class="project-head">
      <div>
        <span>Project Dashboard</span>
        <h1>${escapeHtml(p.name)}</h1>
        <p>${escapeHtml(bundle.aiGenerated.overview || p.idea)}</p>
      </div>
      <button type="button" data-route="update">Update Project</button>
    </header>
    ${bundle.aiGenerated.fromAI ? "" : `<div class="notice inline"><span>AI analysis unavailable. Showing a basic generated roadmap; progress still saves.</span></div>`}
    <section class="dashboard-grid">
      <article class="metric-block"><span>Progress</span><strong>${progressPercent()}%</strong><small>${tasks().filter((task) => task.status === "completed").length} of ${tasks().length} tasks complete</small></article>
      <article class="metric-block"><span>Budget</span><strong>$${p.budgetActual ?? 0} / $${p.budgetTarget ?? 0}</strong><small>Estimated total: $${bundle.aiGenerated.totalEstimatedCost ?? p.budgetTarget ?? 0}</small></article>
      <article class="metric-block"><span>Current Task</span><strong>${escapeHtml(active?.title ?? "No task")}</strong><small>${escapeHtml(active?.description ?? "")}</small></article>
      <article class="metric-block"><span>Recent Update</span><strong>${recent ? escapeHtml(recent.userNote || "Progress saved") : "No updates yet"}</strong><small>${recent ? new Date(recent.timestamp).toLocaleString() : "Upload progress when you start building."}</small></article>
    </section>
    <section class="content-grid">
      <article class="section-block">
        <div class="section-title"><span>Assembly</span><button type="button" data-route="roadmap" class="secondary">View roadmap</button></div>
        ${renderSvg(bundle.aiGenerated.assemblyDrawing, "No assembly drawing yet.")}
      </article>
      <article class="section-block">
        <div class="section-title"><span>Materials</span></div>
        ${renderMaterials(bundle.aiGenerated.materials)}
      </article>
    </section>
    <section class="content-grid equal-cols">
      <article class="section-block">${renderTaskDetail(selectedTask() ?? active)}</article>
      <article class="section-block">${renderInstructionsCompact(bundle.aiGenerated.instructions)}</article>
    </section>
  `;
  return article;
}

function renderRoadmapPage() {
  const page = document.createElement("section");
  page.className = "roadmap-page";
  page.innerHTML = `
    <header class="page-head"><span>Roadmap</span><h1>Build path</h1><p>Statuses come from the backend. The frontend only displays and submits updates.</p></header>
    <section class="content-grid wide-left">
      <article class="section-block roadmap-canvas">${renderTaskGraph()}</article>
      <article class="section-block">${renderTaskDetail(selectedTask())}</article>
    </section>
    <article class="section-block roadmap-list">${tasks().map(renderTaskRow).join("")}</article>
  `;
  return page;
}

function renderTaskGraph() {
  const all = tasks();
  if (!all.length) return `<p>No roadmap yet.</p>`;
  return `
    <div class="roadmap-flow">
      ${all.map((task, i) => `
        ${i > 0 ? '<span class="flow-arrow">→</span>' : ''}
        <button type="button" data-task="${task.id}" class="flow-node ${task.status} ${state.selectedTaskId === task.id ? "selected" : ""}">
          <span class="flow-num">${i + 1}</span>
          <strong>${escapeHtml(task.title)}</strong>
        </button>
      `).join("")}
    </div>
  `;
}

function renderTaskRow(task: RoadmapTask) {
  return `
    <button type="button" data-task="${task.id}" class="task-row ${task.status}">
      <span>${statusText(task.status)}</span>
      <strong>${escapeHtml(task.title)}</strong>
      <small>${escapeHtml(task.description)}</small>
    </button>
  `;
}

function renderTaskDetail(task?: RoadmapTask) {
  if (!task) return `<p>No task selected.</p>`;
  return `
    <div class="section-title"><span>Selected Task</span><strong>${statusText(task.status)}</strong></div>
    <h2>${escapeHtml(task.title)}</h2>
    <p>${escapeHtml(task.description)}</p>
    <dl class="detail-list">
      <dt>Dependencies</dt><dd>${task.dependencies.length ? task.dependencies.map(escapeHtml).join(", ") : "None"}</dd>
      <dt>Materials / guide</dt><dd>${escapeHtml(task.visualGuide || task.materials || "Not specified")}</dd>
    </dl>
    ${task.svgProfile ? renderSvg(task.svgProfile, "") : ""}
    ${task.tips?.length ? `<div class="tips">${task.tips.map((tip) => `<span>${escapeHtml(tip)}</span>`).join("")}</div>` : ""}
    ${task.openscadCode ? renderCode(task.openscadCode) : ""}
  `;
}

function renderUpdatePage() {
  const analysis = state.bundle?.lastAnalysis;
  const latest = selectedCommit();
  const page = document.createElement("section");
  page.className = "update-page";
  page.innerHTML = `
    <header class="page-head"><span>Update Project</span><h1>Upload progress</h1><p>Add a photo, screenshot, or note. Forgemap will turn it into a progress update and roadmap change.</p></header>
    <section class="content-grid">
      <article class="section-block">
        <form class="update-form" novalidate>
          <label class="dropzone">
            <input name="photo" type="file" accept="image/*" />
            <span class="upload-icon">+</span>
            <strong data-photo-name>Photo, camera upload, or screenshot</strong>
            <small class="drop-hint">Drag and drop files here, or click to browse</small>
          </label>
          <div class="field"><span class="form-label">Progress note</span><textarea name="note" rows="5"></textarea></div>
          <button type="button" data-upload-progress>Analyze Progress Update</button>
        </form>
      </article>
      <article class="section-block">
        <div class="section-title"><span>Latest Analysis</span>${analysis?.fromAI === false ? `<strong>Fallback</strong>` : ""}</div>
        ${latest?.mediaUrl ? `<img class="preview-image" src="${mediaUrl(latest.mediaUrl)}" alt="Latest progress" />` : `<p>No progress image yet.</p>`}
        <h2>${escapeHtml(analysis?.summary ?? latest?.userNote ?? "No analysis yet")}</h2>
        ${analysis?.nextStep?.svgGuide ? renderSvg(analysis.nextStep.svgGuide, "") : ""}
        ${analysis?.nextSteps?.length ? `<ul class="plain-list">${analysis.nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>` : ""}
        ${analysis?.nextStep?.openscadCode ? renderCode(analysis.nextStep.openscadCode) : ""}
      </article>
    </section>
  `;
  return page;
}

function renderHistoryPage() {
  const page = document.createElement("section");
  page.innerHTML = `
    <header class="page-head"><span>History</span><h1>Progress timeline</h1><p>Every update becomes a project record with media, detected changes, and completed tasks.</p></header>
    <article class="section-block timeline">${commits().length ? commits().map(renderCommitCard).join("") : `<p>No progress updates yet.</p>`}</article>
  `;
  return page;
}

function renderCommitCard(commit: Commit) {
  return `
    <button type="button" data-commit="${commit.id}" class="commit-card ${state.selectedCommitId === commit.id ? "selected" : ""}">
      ${commit.mediaUrl ? `<img src="${mediaUrl(commit.mediaUrl)}" alt="Progress thumbnail" />` : `<span class="thumbnail-empty"></span>`}
      <span><strong>${escapeHtml(commit.userNote || "Progress update")}</strong><small>${new Date(commit.timestamp).toLocaleString()}</small><small>${escapeHtml(commit.detectedChanges.added.concat(commit.detectedChanges.modified).join(", ") || "Saved update")}</small></span>
      <b>${commit.completedTasks.length} done</b>
    </button>
  `;
}

function renderDiffPage() {
  const [latest, previous] = commits();
  const added = latest?.detectedChanges.added ?? [];
  const modified = latest?.detectedChanges.modified ?? [];
  const removed = latest?.detectedChanges.removed ?? [];
  const page = document.createElement("section");
  page.innerHTML = `
    <header class="page-head"><span>Diff</span><h1>What changed?</h1><p>Added, removed, and modified items from the latest progress update.</p></header>
    <section class="content-grid">
      <article class="section-block diff-images">
        <figure>${previous?.mediaUrl ? `<img src="${mediaUrl(previous.mediaUrl)}" />` : `<div class="empty-image">No previous image</div>`}<figcaption>Previous</figcaption></figure>
        <figure>${latest?.mediaUrl ? `<img src="${mediaUrl(latest.mediaUrl)}" />` : `<div class="empty-image">No current image</div>`}<figcaption>Current</figcaption></figure>
      </article>
      <article class="section-block diff-lists">
        ${renderDiffList("Added", added, "added")}
        ${renderDiffList("Modified", modified, "modified")}
        ${renderDiffList("Removed", removed, "removed")}
      </article>
    </section>
  `;
  return page;
}

function renderDocsPage() {
  const doc = state.bundle?.documentation ?? fallbackDocumentation();
  const page = document.createElement("section");
  page.innerHTML = `
    <header class="page-head"><span>Documentation</span><h1>${escapeHtml(doc.title)}</h1><p>${escapeHtml(doc.overview)}</p><button type="button" data-generate-docs>Refresh Docs</button></header>
    <article class="document-page section-block">
      <h2>Materials</h2>${renderMaterials(doc.materials)}
      <h2>Build Timeline</h2>${doc.commitHistory.map((item) => `<section><strong>${new Date(item.timestamp).toLocaleString()}</strong><p>${escapeHtml(item.summary)}</p><ul>${item.changes.map((change) => `<li>${escapeHtml(change)}</li>`).join("")}</ul></section>`).join("")}
      <h2>Design Decisions</h2>${doc.designDecisions.map((d) => `<p><strong>${escapeHtml(d.decision)}</strong> — ${escapeHtml(d.reason)} ${escapeHtml(d.consequence)}</p>`).join("")}
      <h2>Reproduction Steps</h2><ol>${doc.reproductionSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
    </article>
  `;
  return page;
}

function renderMaterials(materials: Material[]) {
  if (!materials.length) return `<p>No materials yet.</p>`;
  return `<div class="materials-list">${materials.map((m) => `<div><strong>${escapeHtml(m.item)}</strong><span>Qty ${m.quantity}</span><span>$${m.estimatedCost ?? m.actualCost ?? 0}</span></div>`).join("")}</div>`;
}

function renderInstructions(instructions: string[]) {
  return `<div class="section-title"><span>Instructions</span></div><ul class="plain-list">${instructions.map((item) => `<li class="${item.trim().startsWith("⚠️") ? "warning" : ""}">${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderInstructionsCompact(instructions: string[]) {
  if (!instructions.length) return `<div class="section-title"><span>Instructions</span></div><p>No instructions yet.</p>`;
  const visible = instructions.slice(0, 6);
  const remaining = instructions.length - visible.length;
  return `<div class="section-title"><span>Instructions</span><small>${instructions.length} steps</small></div>
    <ol class="instructions-compact">${visible.map((item) => `<li class="${item.trim().startsWith("⚠️") ? "warning" : ""}">${escapeHtml(item)}</li>`).join("")}</ol>
    ${remaining > 0 ? `<button type="button" data-route="roadmap" class="secondary" style="margin-top:10px">View all ${instructions.length} steps →</button>` : ""}`;
}

function renderSvg(svg?: string | null, fallback = "No SVG available.") {
  if (!svg || svg.length < 10) return `<div class="svg-empty">${fallback}</div>`;
  let cleaned = svg.trim();
  if (cleaned.startsWith("<svg") || cleaned.startsWith("&lt;svg")) {
    if (cleaned.startsWith("&lt;")) {
      cleaned = cleaned.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    }
    // Remove white background rects so SVG blends with dark theme
    cleaned = cleaned.replace(/<rect[^>]*fill=['"](?:white|#fff|#ffffff)['"][^>]*\/?\s*>/gi, '');
    return `<div class="svg-box">${cleaned}</div>`;
  }
  return `<div class="svg-empty">${fallback}</div>`;
}

function renderCode(code: string) {
  const escaped = escapeHtml(code);
  return `<div class="code-box"><button type="button" data-copy-code="${encodeURIComponent(code)}" class="secondary">Copy OpenSCAD</button><pre>${escaped}</pre></div>`;
}

function renderDiffList(title: string, values: string[], tone: string) {
  return `<div class="diff-list ${tone}"><strong>${title}</strong>${values.length ? values.map((v) => `<span>${escapeHtml(v)}</span>`).join("") : `<small>None</small>`}</div>`;
}

function statusText(status: RoadmapStatus) {
  return status.replace("_", " ");
}

function bindActions() {
  document.querySelectorAll<HTMLElement>("[data-route]").forEach((button) => button.addEventListener("click", () => setRoute(button.dataset.route as Route)));
  document.querySelector("#new-project")?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, emptyState());
    history.pushState(null, "", "#create");
    render();
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach((control) => {
    control.addEventListener("click", (event) => event.stopPropagation());
    control.addEventListener("keydown", (event) => event.stopPropagation());
  });
  bindCreateForms();
  bindUploadForm();
  bindDragAndDrop();
  bindDatePlaceholder();
  bindPlaceholderLoops();
  bindTaskAndCommitSelection();
  bindCopiesAndDocs();
}

function bindCreateForms() {
  document.querySelectorAll<HTMLFormElement>(".create-form").forEach((form) => {
    const file = form.querySelector<HTMLInputElement>('input[type="file"]');
    const name = form.querySelector<HTMLElement>("[data-reference-name]");
    file?.addEventListener("change", () => {
      if (name) name.textContent = file.files?.[0]?.name ?? "Add files";
    });
    form.querySelector("[data-create-project]")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await createProject(form);
    });
    form.addEventListener("submit", (event) => event.preventDefault());
  });
}

async function createProject(form: HTMLFormElement) {
  const data = new FormData(form);
  const title = String(data.get("title") || "").trim();
  const idea = String(data.get("idea") || "").trim();
  const budget = Number(String(data.get("budget") || "").replace(/[^0-9.]/g, ""));
  if (!title || !idea || !budget) {
    showNotice("Add a title, build description, and budget first.");
    return;
  }
  state.busy = "Generating your project plan...";
  render();
  try {
    const result = await api<{ project: Project; aiGenerated: AiGenerated }>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, budget, deadline: String(data.get("deadline") || "") }),
    });
    state.bundle = { ...result, commits: [] };
    state.notice = result.aiGenerated.fromAI ? "" : "AI unavailable. Showing fallback project tracking.";
  } catch {
    state.bundle = mockProject(title, idea, budget, String(data.get("deadline") || ""));
    state.notice = "Backend is not running yet. Using local demo data that matches the integration contract.";
  }
  state.selectedTaskId = state.bundle.project.roadmapTasks[0]?.id ?? "";
  state.selectedCommitId = "";
  state.route = "dashboard";
  state.busy = "";
  history.pushState(null, "", "#dashboard");
  saveState();
  render();
}

function bindUploadForm() {
  const form = document.querySelector<HTMLFormElement>(".update-form");
  if (!form || !state.bundle) return;
  const file = form.querySelector<HTMLInputElement>('input[name="photo"]');
  const name = form.querySelector<HTMLElement>("[data-photo-name]");
  file?.addEventListener("change", () => {
    if (name) name.textContent = file.files?.[0]?.name ?? "Photo, camera upload, or screenshot";
  });
  form.querySelector("[data-upload-progress]")?.addEventListener("click", async () => {
    const data = new FormData(form);
    const photo = file?.files?.[0];
    const note = String(data.get("note") || "").trim();
    if (!photo && !note) {
      showNotice("Add a photo or a note before analyzing progress.");
      return;
    }
    if (photo) data.set("photo", photo);
    state.busy = photo ? "Analyzing your progress..." : "Saving progress update...";
    render();
    try {
      const result = await api<{ commit: Commit; analysis: CommitAnalysis }>(`/projects/${state.bundle!.project.id}/commits`, { method: "POST", body: data });
      applyCommit(result.commit, result.analysis);
    } catch {
      applyCommit(mockCommit(note, photo), mockAnalysis(photo));
      state.notice = "Backend is not running yet. Progress was saved locally for the demo.";
    }
    state.busy = "";
    state.route = "update";
    saveState();
    render();
  });
}

function bindDragAndDrop() {
  document.querySelectorAll<HTMLElement>(".dropzone, .upload-strip").forEach((zone) => {
    const fileInput = zone.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) return;

    const prevent = (e: Event) => { e.preventDefault(); e.stopPropagation(); };

    zone.addEventListener("dragenter", (e) => { prevent(e); zone.classList.add("drag-over"); });
    zone.addEventListener("dragover", (e) => { prevent(e); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", (e) => { prevent(e); zone.classList.remove("drag-over"); });
    zone.addEventListener("drop", (e: DragEvent) => {
      prevent(e);
      zone.classList.remove("drag-over");
      const files = e.dataTransfer?.files;
      if (!files?.length) return;

      const dt = new DataTransfer();
      dt.items.add(files[0]);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

function applyCommit(commit: Commit, analysis: CommitAnalysis) {
  if (!state.bundle) return;
  state.bundle.commits = [commit, ...state.bundle.commits.filter((item) => item.id !== commit.id)];
  state.bundle.lastAnalysis = analysis;
  state.selectedCommitId = commit.id;
  if (commit.roadmapState?.length) {
    state.bundle.project.roadmapTasks = state.bundle.project.roadmapTasks.map((task) => {
      const updated = commit.roadmapState?.find((item) => item.id === task.id || item.title === task.title);
      return updated ? { ...task, status: updated.status } : task;
    });
  } else {
    advanceLocalRoadmap();
  }
}

function bindDatePlaceholder() {
  document.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach((input) => {
    const update = () => input.classList.toggle("has-value", Boolean(input.value));
    input.addEventListener("input", update);
    input.addEventListener("change", update);
    update();
  });
}

function bindTaskAndCommitSelection() {
  document.querySelectorAll<HTMLElement>("[data-task]").forEach((button) => button.addEventListener("click", () => {
    state.selectedTaskId = button.dataset.task ?? state.selectedTaskId;
    saveState();
    render();
  }));
  document.querySelectorAll<HTMLElement>("[data-commit]").forEach((button) => button.addEventListener("click", () => {
    state.selectedCommitId = button.dataset.commit ?? state.selectedCommitId;
    setRoute("update");
  }));
}

function bindCopiesAndDocs() {
  document.querySelectorAll<HTMLElement>("[data-copy-code]").forEach((button) => button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(decodeURIComponent(button.dataset.copyCode ?? ""));
    showNotice("OpenSCAD code copied.");
  }));
  document.querySelector("[data-generate-docs]")?.addEventListener("click", async () => {
    if (!state.bundle) return;
    state.busy = "Generating documentation...";
    render();
    try {
      const result = await api<{ documentation: Documentation }>(`/projects/${state.bundle.project.id}/documentation`);
      state.bundle.documentation = result.documentation;
    } catch {
      state.bundle.documentation = fallbackDocumentation();
      state.notice = "Backend is not running yet. Generated local documentation preview.";
    }
    state.busy = "";
    saveState();
    render();
  });
}

function bindPlaceholderLoops() {
  const fields = [
    { el: document.querySelector<HTMLInputElement>('[data-placeholder="title"]'), speed: 0.62, phrases: ["Small rover", "Desk air monitor", "Solar charger", "Hydroponic box"] },
    { el: document.querySelector<HTMLTextAreaElement>('[data-placeholder="idea"]'), speed: 1, phrases: ["I want to build a small rover that avoids obstacles.", "I want to use spare sensors to track room temperature.", "I want to make a portable charger for camping.", "I want to turn a sketch into a working prototype."] },
    { el: document.querySelector<HTMLInputElement>('[data-placeholder="budget"]'), speed: 0.48, phrases: ["$50", "$100", "$200", "$500"] },
  ].filter((item): item is { el: HTMLInputElement | HTMLTextAreaElement; speed: number; phrases: string[] } => Boolean(item.el));
  if (!fields.length) return;
  let phraseIndex = 0;
  let charIndex = 0;
  let deleting = false;
  const tick = () => {
    fields.forEach(({ el, phrases, speed }) => (el.placeholder = phrases[phraseIndex].slice(0, Math.floor(charIndex * speed))));
    const longest = Math.max(...fields.map(({ phrases }) => phrases[phraseIndex].length));
    if (deleting) {
      charIndex -= 1;
      if (charIndex <= 0) {
        deleting = false;
        phraseIndex = (phraseIndex + 1) % fields[0].phrases.length;
      }
    } else {
      charIndex += 1;
      if (charIndex > longest) {
        deleting = true;
        placeholderTimers.push(window.setTimeout(tick, 1000));
        return;
      }
    }
    placeholderTimers.push(window.setTimeout(tick, deleting ? 28 : 42));
  };
  tick();
}

function showNotice(message: string) {
  state.notice = message;
  saveState();
  render();
}

function mockProject(title: string, idea: string, budget: number, deadline: string): ProjectBundle {
  const id = uid("proj");
  const roadmapTasks: RoadmapTask[] = [
    task(id, "Define requirements", "Confirm constraints, target dimensions, and success criteria.", "in_progress", 1, []),
    task(id, "Gather materials", "Collect parts, tools, and reference measurements.", "not_started", 2, ["Define requirements"]),
    task(id, "Build first version", "Assemble the simplest physical version before adding optional features.", "blocked", 3, ["Gather materials"]),
    task(id, "Test and document", "Upload final photos, measurements, and problems solved.", "blocked", 4, ["Build first version"]),
  ];
  roadmapTasks[0].svgProfile = `<svg viewBox="0 0 240 140"><rect x="36" y="42" width="168" height="56" rx="10" fill="none" stroke="currentColor"/><circle cx="72" cy="70" r="14" fill="none" stroke="currentColor"/><path d="M100 70h70" stroke="currentColor"/></svg>`;
  roadmapTasks[0].openscadCode = `// Starter block for ${title}\n$fn=64;\ncube([60, 40, 8], center=true);`;
  return {
    project: { id, name: title, idea, budgetTarget: budget, budgetActual: 0, skillLevel: null, createdAt: new Date().toISOString(), roadmapTasks },
    aiGenerated: {
      overview: `A practical build plan for: ${idea}`,
      assemblyDrawing: `<svg viewBox="0 0 320 180"><rect x="48" y="58" width="224" height="64" rx="12" fill="none" stroke="currentColor"/><path d="M80 122l40 32h80l40-32" fill="none" stroke="currentColor"/><text x="160" y="94" text-anchor="middle" fill="currentColor" font-size="14">${escapeHtml(title)}</text></svg>`,
      materials: [{ item: "Core materials", quantity: 1, estimatedCost: Math.max(1, Math.round(budget * 0.6)) }, { item: "Fasteners / consumables", quantity: 1, estimatedCost: Math.max(1, Math.round(budget * 0.15)) }],
      totalEstimatedCost: Math.round(budget * 0.75),
      tools: ["Measuring tool", "Basic hand tools", "Camera for progress updates"],
      instructions: ["Confirm the build constraints.", "Gather materials before assembly.", "⚠️ Use appropriate safety gear for cutting, soldering, printing, or power tools."],
      fromAI: false,
    },
    commits: [],
  };
}

function task(projectId: string, title: string, description: string, status: RoadmapStatus, order: number, dependencies: string[]): RoadmapTask {
  return { id: uid("task"), projectId, title, description, status, dependencies, order, visualGuide: description, tips: ["Upload a photo after this step", "Keep notes short and specific"], openscadCode: null, svgProfile: null };
}

function mockCommit(note: string, photo?: File): Commit {
  const p = project();
  const active = currentTask();
  return {
    id: uid("commit"),
    projectId: p.id,
    timestamp: new Date().toISOString(),
    mediaUrl: photo ? URL.createObjectURL(photo) : null,
    userNote: note || "Progress update",
    detectedChanges: { added: [active?.title ?? "Visible progress"], removed: [], modified: ["Roadmap state"] },
    projectState: { components: [active?.title ?? "Progress evidence"], completedTasks: active ? [active.title] : [], remainingTasks: tasks().filter((task) => task.id !== active?.id).map((task) => task.title), problems: [] },
    completedTasks: active ? [active.title] : [],
    roadmapState: active ? [{ id: active.id, title: active.title, status: "completed" }] : [],
  };
}

function mockAnalysis(photo?: File): CommitAnalysis {
  const next = tasks().find((task) => task.status === "not_started" || task.status === "blocked");
  return { summary: photo ? "Progress image saved locally. Backend AI will replace this with visual analysis after merge." : "Progress note saved locally.", nextSteps: next ? [`Next: ${next.title}`] : ["Generate documentation."], nextStep: next ? { taskId: next.id, reason: "Previous step is complete, so this is the next dependency-safe task.", svgGuide: next.svgProfile ?? null, openscadCode: next.openscadCode ?? null } : null, fromAI: false };
}

function advanceLocalRoadmap() {
  if (!state.bundle) return;
  const currentIndex = state.bundle.project.roadmapTasks.findIndex((task) => task.status === "in_progress");
  state.bundle.project.roadmapTasks = state.bundle.project.roadmapTasks.map((task, index) => {
    if (index <= currentIndex) return { ...task, status: "completed" };
    if (index === currentIndex + 1) return { ...task, status: "in_progress" };
    return task.status === "blocked" && index <= currentIndex + 2 ? { ...task, status: "not_started" } : task;
  });
}

function fallbackDocumentation(): Documentation {
  const bundle = state.bundle!;
  return { title: bundle.project.name, overview: bundle.aiGenerated.overview, finalResult: "Build in progress.", materials: bundle.aiGenerated.materials, totalCost: bundle.project.budgetActual ?? bundle.aiGenerated.totalEstimatedCost, tools: bundle.aiGenerated.tools, originalRoadmap: bundle.project.roadmapTasks.map((task) => task.title), finalRoadmap: bundle.project.roadmapTasks.map((task) => `${task.title} (${task.status})`), commitHistory: bundle.commits.map((commit) => ({ timestamp: commit.timestamp, summary: commit.userNote || "Progress update", changes: commit.detectedChanges.added.concat(commit.detectedChanges.modified) })), designDecisions: [{ decision: "Track work through progress updates", reason: "Physical projects need a reliable build record", consequence: "Documentation can be generated from history" }], problemsSolved: [], reproductionSteps: bundle.project.roadmapTasks.map((task) => task.description) };
}

window.addEventListener("popstate", () => {
  const hash = location.hash.replace("#", "");
  const routes: Route[] = ["create", "dashboard", "roadmap", "update", "history", "diff", "docs"];
  if (routes.includes(hash as Route)) state.route = hash as Route;
  else if (state.bundle) state.route = "dashboard";
  else state.route = "create";
  render();
});

render();
