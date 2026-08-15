/**
 * AI Client — calls Person 1's AI service.
 * Falls back gracefully to stub responses if the AI service is unreachable
 * or returns malformed data, so the backend never 500s due to AI issues.
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5000';

// ─── Types ───

export interface FeedbackIssue {
  description: string;
  severity: 'critical' | 'warning' | 'suggestion';
  fix: string;
}

export interface Feedback {
  overallAssessment: string;
  issues: FeedbackIssue[];
  positiveNotes: string[];
  alignmentScore: number;
}

export interface ProgressAnalysisResult {
  detectedChanges: {
    added: string[];
    removed: string[];
    modified: string[];
  };
  projectState: {
    components: string[];
    completedTasks: string[];
    remainingTasks: string[];
    problems: string[];
  };
  completedTasks: string[];
  nextSteps: string[];
  summary: string;
  feedback?: Feedback;
  nextStep?: {
    taskId: string;
    reason: string;
    svgGuide: string | null;
    openscadCode: string | null;
  };
}

export interface InitialProjectResult {
  name: string;
  overview: string;
  assemblyDrawing?: string;
  materials: { item: string; quantity: number; estimatedCost: number }[];
  totalEstimatedCost: number;
  tools: string[];
  roadmap: {
    title: string;
    description: string;
    order: number;
    dependencies: string[];
    visualGuide?: string;
    tips?: string[];
    openscadCode?: string;
    svgProfile?: string;
  }[];
  instructions: string[];
}

export interface DocumentationResult {
  title: string;
  overview: string;
  finalResult: string;
  materials: { item: string; quantity: number; actualCost?: number }[];
  totalCost: number;
  tools: string[];
  originalRoadmap: string[];
  finalRoadmap: string[];
  commitHistory: {
    timestamp: string;
    summary: string;
    changes: string[];
  }[];
  designDecisions: { decision: string; reason: string; consequence: string }[];
  problemsSolved: { problem: string; solution: string }[];
  reproductionSteps: string[];
}

// ─── Validation helpers ───

function isValidProgressAnalysis(data: any): data is ProgressAnalysisResult {
  return (
    data &&
    typeof data === 'object' &&
    data.detectedChanges &&
    Array.isArray(data.detectedChanges.added) &&
    Array.isArray(data.detectedChanges.removed) &&
    Array.isArray(data.detectedChanges.modified) &&
    data.projectState &&
    Array.isArray(data.projectState.components) &&
    Array.isArray(data.projectState.completedTasks) &&
    Array.isArray(data.projectState.remainingTasks) &&
    Array.isArray(data.completedTasks) &&
    Array.isArray(data.nextSteps) &&
    typeof data.summary === 'string'
  );
}

function isValidInitialProject(data: any): data is InitialProjectResult {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.name === 'string' &&
    typeof data.overview === 'string' &&
    Array.isArray(data.materials) &&
    typeof data.totalEstimatedCost === 'number' &&
    Array.isArray(data.tools) &&
    Array.isArray(data.roadmap) &&
    data.roadmap.every(
      (r: any) => typeof r.title === 'string' && typeof r.description === 'string' && typeof r.order === 'number'
    ) &&
    Array.isArray(data.instructions)
  );
}

function isValidDocumentation(data: any): data is DocumentationResult {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.title === 'string' &&
    typeof data.overview === 'string'
  );
}

// ─── Stub fallbacks ───

function stubProgressAnalysis(userNote: string | null): ProgressAnalysisResult {
  return {
    detectedChanges: {
      added: ['Progress detected (AI service unavailable — stub response)'],
      removed: [],
      modified: [],
    },
    projectState: {
      components: ['Components detected (stub)'],
      completedTasks: [],
      remainingTasks: [],
      problems: [],
    },
    completedTasks: [],
    nextSteps: ['AI service unavailable — please check connection and retry for detailed analysis.'],
    summary: userNote || 'Progress update recorded. AI analysis unavailable — stub response used.',
  };
}

function stubInitialProject(idea: string): InitialProjectResult {
  return {
    name: `Project: ${idea.slice(0, 50)}`,
    overview: `A project to build: ${idea}`,
    materials: [
      { item: 'Materials TBD (AI service unavailable)', quantity: 1, estimatedCost: 0 },
    ],
    totalEstimatedCost: 0,
    tools: ['Tools TBD (AI service unavailable)'],
    roadmap: [
      {
        title: 'Plan and gather materials',
        description: 'Determine what materials and tools are needed.',
        order: 1,
        dependencies: [],
      },
      {
        title: 'Build core structure',
        description: 'Assemble the main components.',
        order: 2,
        dependencies: [],
      },
      {
        title: 'Test and iterate',
        description: 'Verify functionality and make adjustments.',
        order: 3,
        dependencies: [],
      },
    ],
    instructions: ['AI service unavailable — generic roadmap generated. Retry when service is back online.'],
  };
}

function stubDocumentation(): DocumentationResult {
  return {
    title: 'Project Documentation',
    overview: 'Documentation generation unavailable — AI service could not be reached.',
    finalResult: 'See commit history for project progress.',
    materials: [],
    totalCost: 0,
    tools: [],
    originalRoadmap: [],
    finalRoadmap: [],
    commitHistory: [],
    designDecisions: [],
    problemsSolved: [],
    reproductionSteps: [],
  };
}

// ─── AI response translators ───
// The AI service (Person 1) returns a different JSON shape than what the backend
// uses internally. These functions translate between the two.

function translateAIProjectResponse(raw: any): InitialProjectResult | null {
  try {
    // AI service shape → backend shape
    const name = raw.project_overview?.title || raw.name || null;
    const overview = raw.project_overview?.description || raw.overview || null;

    if (!name || !overview) return null;

    const materials = (raw.materials || []).map((m: any) => ({
      item: m.name || m.item || 'Unknown',
      quantity: typeof m.quantity === 'number' ? m.quantity : parseInt(m.quantity) || 1,
      estimatedCost: m.estimated_price ?? m.estimatedCost ?? 0,
    }));

    const totalEstimatedCost = raw.budget?.estimated_total ?? raw.totalEstimatedCost ?? materials.reduce((sum: number, m: any) => sum + m.estimatedCost * m.quantity, 0);

    const tools: string[] = raw.tools || [];

    const roadmap = (raw.roadmap || []).map((task: any, idx: number) => ({
      title: task.title || `Task ${idx + 1}`,
      description: task.description || '',
      order: idx + 1,
      dependencies: (task.depends_on || task.dependencies || []).map((dep: string) => {
        // AI service uses "task_1" style IDs in depends_on — we need to map to titles
        const depTask = (raw.roadmap || []).find((t: any) => t.id === dep);
        return depTask ? depTask.title : dep;
      }),
      visualGuide: task.visual_guide || task.visualGuide || undefined,
      tips: task.tips || undefined,
      openscadCode: task.openscad_code || task.openscadCode || undefined,
      svgProfile: task.svg_profile || task.svgProfile || undefined,
    }));

    // Instructions: AI returns [{ task_id, steps: [...], caution: string }], we want flat string[]
    let instructions: string[] = [];
    if (Array.isArray(raw.instructions)) {
      if (typeof raw.instructions[0] === 'string') {
        instructions = raw.instructions;
      } else {
        // Flatten { task_id, steps, caution } into string[], prepending caution where relevant
        instructions = raw.instructions.flatMap((inst: any) => {
          const steps = (inst.steps || []).map((step: string) => step);
          if (inst.caution && inst.caution !== 'None' && inst.caution !== 'none') {
            steps.unshift(`⚠️ ${inst.caution}`);
          }
          return steps;
        });
      }
    }

    return { name, overview, assemblyDrawing: raw.assembly_drawing || raw.assemblyDrawing || undefined, materials, totalEstimatedCost, tools, roadmap, instructions };
  } catch (err) {
    console.warn('Failed to translate AI project response:', err);
    return null;
  }
}

function translateAIProgressResponse(raw: any): ProgressAnalysisResult | null {
  try {
    // AI service shape → backend shape
    const detectedChanges = {
      added: raw.detected_changes?.added || raw.detectedChanges?.added || [],
      removed: raw.detected_changes?.removed || raw.detectedChanges?.removed || [],
      modified: raw.detected_changes?.changed || raw.detected_changes?.modified || raw.detectedChanges?.modified || [],
    };

    const completedTasks = raw.completed_tasks || raw.completedTasks || [];
    const remainingTasks = raw.remaining_tasks || raw.remainingTasks || [];
    const problems = raw.problems || [];
    const summary = raw.summary || 'Progress update recorded.';

    const projectState = raw.projectState || {
      components: detectedChanges.added,
      completedTasks,
      remainingTasks,
      problems,
    };

    const nextSteps = raw.next_steps || raw.nextSteps || [];

    // Extract next_step with SVG/OpenSCAD if present
    let nextStep: ProgressAnalysisResult['nextStep'] = undefined;
    const rawNextStep = raw.next_step || raw.nextStep;
    if (rawNextStep && typeof rawNextStep === 'object') {
      nextStep = {
        taskId: rawNextStep.task_id || rawNextStep.taskId || '',
        reason: rawNextStep.reason || '',
        svgGuide: rawNextStep.svg_guide || rawNextStep.svgGuide || null,
        openscadCode: rawNextStep.openscad_code || rawNextStep.openscadCode || null,
      };
    }

    // Extract feedback if present
    let feedback: ProgressAnalysisResult['feedback'] = undefined;
    const rawFeedback = raw.feedback;
    if (rawFeedback && typeof rawFeedback === 'object') {
      feedback = {
        overallAssessment: rawFeedback.overall_assessment || rawFeedback.overallAssessment || '',
        issues: (rawFeedback.issues || []).map((issue: any) => ({
          description: issue.description || '',
          severity: ['critical', 'warning', 'suggestion'].includes(issue.severity) ? issue.severity : 'suggestion',
          fix: issue.fix || '',
        })),
        positiveNotes: rawFeedback.positive_notes || rawFeedback.positiveNotes || [],
        alignmentScore: typeof rawFeedback.alignment_score === 'number' ? rawFeedback.alignment_score : (typeof rawFeedback.alignmentScore === 'number' ? rawFeedback.alignmentScore : 0),
      };
    }

    return { detectedChanges, projectState, completedTasks, nextSteps, summary, feedback, nextStep };
  } catch (err) {
    console.warn('Failed to translate AI progress response:', err);
    return null;
  }
}

function translateAIDocumentationResponse(raw: any): DocumentationResult | null {
  try {
    return {
      title: raw.project_overview ? `${raw.project_overview}` : raw.title || 'Project Documentation',
      overview: raw.project_overview || raw.overview || '',
      finalResult: raw.final_result?.description || raw.finalResult || '',
      materials: (raw.materials_used || raw.materials || []).map((m: any) => ({
        item: m.name || m.item || 'Unknown',
        quantity: typeof m.quantity === 'number' ? m.quantity : parseInt(m.quantity) || 1,
        actualCost: m.actual_price ?? m.actualCost,
      })),
      totalCost: raw.actual_cost ?? raw.totalCost ?? 0,
      tools: raw.tools_used || raw.tools || [],
      originalRoadmap: (raw.original_roadmap || raw.originalRoadmap || []).map((t: any) => typeof t === 'string' ? t : t.title || ''),
      finalRoadmap: (raw.final_roadmap || raw.finalRoadmap || []).map((t: any) => typeof t === 'string' ? t : t.title || ''),
      commitHistory: (raw.commit_history || raw.commitHistory || []).map((c: any) => ({
        timestamp: c.timestamp || '',
        summary: c.summary || c.user_note || '',
        changes: c.changes || c.detected_changes?.added || [],
      })),
      designDecisions: (raw.design_decisions || raw.designDecisions || []).map((d: any) => ({
        decision: d.decision || d.change || '',
        reason: d.reason || '',
        consequence: d.consequence || '',
      })),
      problemsSolved: (raw.problems_encountered || raw.problemsSolved || []).map((p: any) => ({
        problem: p.problem || '',
        solution: p.solution || '',
      })),
      reproductionSteps: raw.reproduction_instructions || raw.reproductionSteps || [],
    };
  } catch (err) {
    console.warn('Failed to translate AI documentation response:', err);
    return null;
  }
}

// ─── Real AI calls with fallback ───

/**
 * Generate initial project plan from user's idea + constraints.
 * Calls POST AI_SERVICE_URL/generate-project
 */
export async function generateInitialProject(
  idea: string,
  constraints: { budget?: number; skillLevel?: string; tools?: string[]; deadline?: string; referenceImage?: string }
): Promise<{ result: InitialProjectResult; fromAI: boolean }> {
  try {
    // Map camelCase to snake_case for the AI service
    const body = {
      idea,
      budget: constraints.budget,
      skill_level: constraints.skillLevel,
      tools_available: constraints.tools,
      deadline: constraints.deadline,
    };

    const response = await fetch(`${AI_SERVICE_URL}/generate-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000), // 5 min timeout — Backboard can be very slow
    });

    if (!response.ok) {
      console.warn(`AI service returned ${response.status} for /generate-project. Falling back to stub.`);
      return { result: stubInitialProject(idea), fromAI: false };
    }

    const data = await response.json();

    // Try to translate the AI service's response shape into ours
    const translated = translateAIProjectResponse(data);
    if (!translated) {
      console.warn('AI service returned untranslatable project data. Falling back to stub.');
      console.warn('Received:', JSON.stringify(data).slice(0, 500));
      return { result: stubInitialProject(idea), fromAI: false };
    }

    return { result: translated, fromAI: true };
  } catch (err: any) {
    console.warn(`AI service unreachable for /generate-project: ${err.message}. Falling back to stub.`);
    return { result: stubInitialProject(idea), fromAI: false };
  }
}

/**
 * Analyze progress from an uploaded photo/screenshot.
 * Calls POST AI_SERVICE_URL/analyze-progress
 * Sends the image as multipart/form-data (matching the AI service's multer expectation).
 * Falls back to stub if no image is provided (AI service requires an image for vision analysis).
 */
export async function analyzeProgress(
  imageBuffer: Buffer | null,
  userNote: string | null,
  currentState: any
): Promise<{ result: ProgressAnalysisResult; fromAI: boolean }> {
  // AI service requires an image for vision analysis — if no image, use stub
  if (!imageBuffer) {
    console.warn('No image provided for progress analysis. Using stub response.');
    return { result: stubProgressAnalysis(userNote), fromAI: false };
  }

  try {
    const formData = new FormData();

    // Image file (required by AI service)
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' });
    formData.append('image', blob, 'progress.jpg');

    // Project context as JSON strings (AI service parses these)
    formData.append('project_state', JSON.stringify(currentState));
    formData.append('roadmap', JSON.stringify(currentState?.roadmapTasks || []));

    if (userNote) {
      formData.append('user_note', userNote);
    }

    const response = await fetch(`${AI_SERVICE_URL}/analyze-progress`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(300000), // 3 min timeout
    });

    if (!response.ok) {
      console.warn(`AI service returned ${response.status} for /analyze-progress. Falling back to stub.`);
      return { result: stubProgressAnalysis(userNote), fromAI: false };
    }

    const data = await response.json();

    // Try to translate
    const translated = translateAIProgressResponse(data);
    if (!translated) {
      console.warn('AI service returned untranslatable progress analysis. Falling back to stub.');
      console.warn('Received:', JSON.stringify(data).slice(0, 500));
      return { result: stubProgressAnalysis(userNote), fromAI: false };
    }

    return { result: translated, fromAI: true };
  } catch (err: any) {
    console.warn(`AI service unreachable for /analyze-progress: ${err.message}. Falling back to stub.`);
    return { result: stubProgressAnalysis(userNote), fromAI: false };
  }
}

/**
 * Generate final project documentation.
 * Calls POST AI_SERVICE_URL/generate-docs (note: "docs" not "documentation")
 */
export async function generateDocumentation(
  project: any,
  commits: any[],
  roadmapTasks: any[]
): Promise<{ result: DocumentationResult; fromAI: boolean }> {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/generate-docs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project,
        commits,
        roadmapTasks,
        original_roadmap: roadmapTasks,
        final_roadmap: roadmapTasks,
      }),
      signal: AbortSignal.timeout(300000), // 3 min timeout
    });

    if (!response.ok) {
      console.warn(`AI service returned ${response.status} for /generate-docs. Falling back to stub.`);
      return { result: stubDocumentation(), fromAI: false };
    }

    const data = await response.json();

    // Try to translate
    const translated = translateAIDocumentationResponse(data);
    if (!translated) {
      console.warn('AI service returned untranslatable documentation. Falling back to stub.');
      console.warn('Received:', JSON.stringify(data).slice(0, 500));
      return { result: stubDocumentation(), fromAI: false };
    }

    return { result: translated, fromAI: true };
  } catch (err: any) {
    console.warn(`AI service unreachable for /generate-docs: ${err.message}. Falling back to stub.`);
    return { result: stubDocumentation(), fromAI: false };
  }
}
