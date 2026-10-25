// Edit module public API: the shared edit actions used by the Studio, the CLI
// (`docgen edit`/`docgen undo`/`docgen catch-up`) and, later, the generator MCP server.
export * from "./types.js";
export { findHelpRoot, docgenDir } from "./help-root.js";
export {
  setStepField,
  setStepActions,
  reorderSteps,
  removeStep,
  insertStep,
  type StepField,
  type RemovedStep,
  type InsertStepOptions,
} from "./steps.js";
export { setPageBlock } from "./page.js";
export { setData } from "./data.js";
export { lock, unlock, isLocked, isLockedAny, readLocks } from "./locks.js";
export {
  appendHistory,
  readHistory,
  undo,
  catchUp,
  historyPath,
  readLastCatchUpAt,
  writeLastCatchUpAt,
  type UndoResult,
} from "./history.js";
