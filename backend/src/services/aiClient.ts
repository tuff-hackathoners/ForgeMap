/**
 * AI Client — calls Person 1's AI service.
 * Falls back gracefully to stub responses if the AI service is unreachable
 * or returns malformed data, so the backend never 500s due to AI issues.
 */

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:5000';

// ─── Types ───

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
}

export interface InitialProjectResult {
  name: string;
  overview: string;
  materials: { item: string; quantity: number; estimatedCost: number }[];
  totalEstimatedCost: number;
  tools: string[];
  roadmap: {
    title: string;
    description: string;
    order: number;
    dependencies: string[];
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
    const response = await fetch(`${AI_SERVICE_URL}/generate-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea, ...constraints }),
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    if (!response.ok) {
      console.warn(`AI service returned ${response.status} for /generate-project. Falling back to stub.`);
      return { result: stubInitialProject(idea), fromAI: false };
    }

    const data = await response.json();

    if (!isValidInitialProject(data)) {
      console.warn('AI service returned malformed initial project data. Falling back to stub.');
      console.warn('Received:', JSON.stringify(data).slice(0, 500));
      return { result: stubInitialProject(idea), fromAI: false };
    }

    return { result: data, fromAI: true };
  } catch (err: any) {
    console.warn(`AI service unreachable for /generate-project: ${err.message}. Falling back to stub.`);
    return { result: stubInitialProject(idea), fromAI: false };
  }
}

/**
 * Analyze progress from an uploaded photo/screenshot.
 * Calls POST AI_SERVICE_URL/analyze-progress
 * Sends the image as base64 in the JSON body (simple, no multipart needed between services).
 */
export async function analyzeProgress(
  imageBuffer: Buffer | null,
  userNote: string | null,
  currentState: any
): Promise<{ result: ProgressAnalysisResult; fromAI: boolean }> {
  try {
    const body: any = {
      userNote,
      currentState,
    };

    // Send image as base64 if present
    if (imageBuffer) {
      body.image = imageBuffer.toString('base64');
      body.imageFormat = 'base64';
    }

    const response = await fetch(`${AI_SERVICE_URL}/analyze-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000), // 60s timeout (image analysis takes longer)
    });

    if (!response.ok) {
      console.warn(`AI service returned ${response.status} for /analyze-progress. Falling back to stub.`);
      return { result: stubProgressAnalysis(userNote), fromAI: false };
    }

    const data = await response.json();

    if (!isValidProgressAnalysis(data)) {
      console.warn('AI service returned malformed progress analysis. Falling back to stub.');
      console.warn('Received:', JSON.stringify(data).slice(0, 500));
      return { result: stubProgressAnalysis(userNote), fromAI: false };
    }

    return { result: data, fromAI: true };
  } catch (err: any) {
    console.warn(`AI service unreachable for /analyze-progress: ${err.message}. Falling back to stub.`);
    return { result: stubProgressAnalysis(userNote), fromAI: false };
  }
}

/**
 * Generate final project documentation.
 * Calls POST AI_SERVICE_URL/generate-documentation
 */
export async function generateDocumentation(
  project: any,
  commits: any[],
  roadmapTasks: any[]
): Promise<{ result: DocumentationResult; fromAI: boolean }> {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/generate-documentation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, commits, roadmapTasks }),
      signal: AbortSignal.timeout(60000), // 60s timeout
    });

    if (!response.ok) {
      console.warn(`AI service returned ${response.status} for /generate-documentation. Falling back to stub.`);
      return { result: stubDocumentation(), fromAI: false };
    }

    const data = await response.json();

    if (!isValidDocumentation(data)) {
      console.warn('AI service returned malformed documentation. Falling back to stub.');
      console.warn('Received:', JSON.stringify(data).slice(0, 500));
      return { result: stubDocumentation(), fromAI: false };
    }

    return { result: data, fromAI: true };
  } catch (err: any) {
    console.warn(`AI service unreachable for /generate-documentation: ${err.message}. Falling back to stub.`);
    return { result: stubDocumentation(), fromAI: false };
  }
}
