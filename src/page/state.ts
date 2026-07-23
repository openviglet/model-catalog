/* Shared mutable page state (T65).
 *
 * ES-module imports are read-only live bindings — an importer cannot reassign
 * `import { sortKey }`. So every value that is *reassigned* from more than one
 * module lives as a property on this single `state` object (state.sortKey = …).
 * The Sets below are only ever mutated in place (never reassigned), so they are
 * exported directly. Single-module state (palette cursor, analytics tab, toast
 * timer) stays as a local `let` in its own module and is intentionally absent. */
import type { Catalog, ModelEntry, PaletteEntry } from "./types.js";

export const state: {
  catalog: Catalog | null;
  activeKind: string | null;
  byKey: Map<string, ModelEntry>;
  drawerModel: ModelEntry | null;
  sortKey: string | null;
  sortDir: number;
  groupBy: string | null;
  page: number;
  colChoice: string[] | null;
  palIndex: PaletteEntry[];
  palResults: PaletteEntry[];
  palActive: number;
} = {
  catalog: null,
  activeKind: null,
  byKey: new Map(),
  drawerModel: null,
  sortKey: null,
  sortDir: 1,
  groupBy: null,
  page: 1,
  colChoice: null,
  palIndex: [],
  palResults: [],
  palActive: 0,
};

export const collapsed = new Set<string>();
export const pinned = new Set<string>();          // "vendor/id" pinned for compare (max 4)
export const activeCaps = new Set<string>();       // capability chips (AND)
export const activeInMods = new Set<string>();     // input-modality chips (AND)
export const activeOutMods = new Set<string>();    // output-modality chips (AND)
export const activeTags = new Set<string>();       // use-case tag chips (AND)
export const activeTiers = new Set<string>();      // price-tier band chips (OR)
export const activeHas = new Set<string>();        // has price/benchmark/speed (AND)
export const facetCollapsed = new Set<string>(["cap", "in", "out"]); // long groups collapse by default
