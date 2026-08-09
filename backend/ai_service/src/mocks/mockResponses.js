// Mock data matching ai-json-schemas.md exactly.
// Routes return these until the real Claude API calls replace them.
// Keep these in sync with the schema doc if you change field names.

export const mockProjectGeneration = {
  project_overview: {
    title: "Autonomous Rover",
    description: "A budget autonomous rover with basic obstacle-avoidance navigation."
  },
  materials: [
    { name: "Arduino Uno", quantity: "1", estimated_price: 24.0 },
    { name: "DC Gear Motors", quantity: "2", estimated_price: 12.0 }
  ],
  tools: ["Soldering iron", "Screwdriver set", "Multimeter"],
  budget: { estimated_total: 173.0, currency: "USD" },
  roadmap: [
    {
      id: "task_1",
      title: "Design chassis",
      description: "Sketch and cut the base chassis plate.",
      status: "not_started",
      depends_on: []
    },
    {
      id: "task_2",
      title: "Build drivetrain",
      description: "Mount motors and wheels to chassis.",
      status: "not_started",
      depends_on: ["task_1"]
    }
  ],
  instructions: [
    { task_id: "task_1", steps: ["Measure chassis dimensions", "Cut base plate", "Drill mounting holes"] },
    { task_id: "task_2", steps: ["Attach motor brackets", "Mount motors", "Attach wheels"] }
  ]
};

export const mockProgressAnalysis = {
  detected_changes: {
    added: ["Motor controller", "Battery"],
    removed: [],
    changed: ["Battery position"]
  },
  completed_tasks: ["task_2"],
  remaining_tasks: ["task_3", "task_4"],
  problems: ["Wiring near motor controller looks unsecured"],
  summary: "Drivetrain is complete. Battery was repositioned to the rear of the chassis."
};

export const mockNextSteps = {
  next_steps: [
    {
      task_id: "task_4",
      reason: "Odometry and localization both depend on the encoder being installed and calibrated first.",
      priority: 1
    },
    {
      task_id: "task_6",
      reason: "Sensor wiring can happen in parallel once electronics housing is finalized.",
      priority: 2
    }
  ]
};

export const mockFinalDocs = {
  project_overview: "What was built and why.",
  final_result: { description: "A working autonomous rover that avoids obstacles using ultrasonic sensors." },
  materials_used: [{ name: "Arduino Uno", quantity: "1", actual_price: 22.5 }],
  actual_cost: 168.0,
  tools_used: ["Soldering iron", "Multimeter"],
  original_roadmap: [],
  final_roadmap: [],
  commit_history: [],
  design_decisions: [
    {
      change: "Battery moved to rear of chassis.",
      reason: "Original position caused interference with the motor controller.",
      decision: "Keep the new position.",
      consequence: "Required a 10cm longer power cable."
    }
  ],
  problems_encountered: [{ problem: "Motor controller interference", solution: "Relocated battery to rear." }],
  final_specifications: { dimensions: "30cm x 20cm x 15cm", capabilities: "Obstacle avoidance, remote start" },
  reproduction_instructions: ["Step 1: Cut chassis to spec.", "Step 2: Mount drivetrain."]
};