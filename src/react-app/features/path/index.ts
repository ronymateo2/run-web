export { PhasesOverviewScreen } from "./screens/PhasesOverviewScreen";
export { PhaseJourneyScreen } from "./screens/PhaseJourneyScreen";
export { PhaseExercisesScreen } from "./screens/PhaseExercisesScreen";
export { PhaseExercisesEditScreen } from "./screens/PhaseExercisesEditScreen";
export { InjuryEditScreen } from "./screens/InjuryEditScreen";
export { PhaseEditScreen } from "./screens/PhaseEditScreen";

// ProgressScreen + PromDetailScreen are intentionally NOT re-exported here:
// the router lazy-loads them directly (recharts/markdown) to keep them in
// their own chunks. Importing them through this barrel would pull those
// heavy deps into any eager consumer of the path feature.
