/**
 * Diff Engine
 * Compares two project states and returns added/removed/changed elements.
 * This is the deterministic fallback — even if the AI also returns a diff,
 * this guarantees demo reliability without depending on LLM consistency.
 */

export interface ProjectState {
  components: string[];
  completedTasks: string[];
  remainingTasks: string[];
  problems: string[];
}

export interface DiffResult {
  added: {
    components: string[];
    completedTasks: string[];
    problems: string[];
  };
  removed: {
    components: string[];
    completedTasks: string[];
    problems: string[];
  };
  changed: {
    tasksCompleted: string[];   // tasks that moved from remaining → completed
    tasksAdded: string[];       // new tasks that didn't exist before
    tasksRemoved: string[];     // tasks that were removed entirely
  };
  summary: {
    componentsAdded: number;
    componentsRemoved: number;
    tasksCompleted: number;
    newProblems: number;
    resolvedProblems: number;
  };
}

/**
 * Compute a diff between two project states.
 * @param prev - The previous project state (state A)
 * @param curr - The current project state (state B)
 * @returns A structured diff showing what changed
 */
export function computeDiff(prev: ProjectState | null, curr: ProjectState): DiffResult {
  // If there's no previous state, everything in current is "added"
  if (!prev) {
    return {
      added: {
        components: curr.components,
        completedTasks: curr.completedTasks,
        problems: curr.problems,
      },
      removed: {
        components: [],
        completedTasks: [],
        problems: [],
      },
      changed: {
        tasksCompleted: curr.completedTasks,
        tasksAdded: [...curr.completedTasks, ...curr.remainingTasks],
        tasksRemoved: [],
      },
      summary: {
        componentsAdded: curr.components.length,
        componentsRemoved: 0,
        tasksCompleted: curr.completedTasks.length,
        newProblems: curr.problems.length,
        resolvedProblems: 0,
      },
    };
  }

  // Components diff
  const addedComponents = curr.components.filter((c) => !prev.components.includes(c));
  const removedComponents = prev.components.filter((c) => !curr.components.includes(c));

  // Tasks diff — tasks that were in remaining but are now in completed
  const tasksCompleted = curr.completedTasks.filter((t) => !prev.completedTasks.includes(t));

  // All tasks (completed + remaining)
  const prevAllTasks = new Set([...prev.completedTasks, ...prev.remainingTasks]);
  const currAllTasks = new Set([...curr.completedTasks, ...curr.remainingTasks]);

  const tasksAdded = [...currAllTasks].filter((t) => !prevAllTasks.has(t));
  const tasksRemoved = [...prevAllTasks].filter((t) => !currAllTasks.has(t));

  // Problems diff
  const addedProblems = curr.problems.filter((p) => !prev.problems.includes(p));
  const removedProblems = prev.problems.filter((p) => !curr.problems.includes(p));

  // Completed tasks that were "un-completed" (edge case, shouldn't normally happen)
  const uncompletedTasks = prev.completedTasks.filter((t) => !curr.completedTasks.includes(t));

  return {
    added: {
      components: addedComponents,
      completedTasks: tasksCompleted,
      problems: addedProblems,
    },
    removed: {
      components: removedComponents,
      completedTasks: uncompletedTasks,
      problems: removedProblems,
    },
    changed: {
      tasksCompleted,
      tasksAdded,
      tasksRemoved,
    },
    summary: {
      componentsAdded: addedComponents.length,
      componentsRemoved: removedComponents.length,
      tasksCompleted: tasksCompleted.length,
      newProblems: addedProblems.length,
      resolvedProblems: removedProblems.length,
    },
  };
}
