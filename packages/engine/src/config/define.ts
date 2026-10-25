import type { DocgenConfig } from "./types.js";

/**
 * Identity helper that gives `docgen.config.ts`/`.mjs` authors type-checking
 * and editor completion. `export default defineConfig({...})`.
 */
export function defineConfig(config: DocgenConfig): DocgenConfig {
  return config;
}
