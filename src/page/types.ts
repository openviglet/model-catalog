/* Data model for the browsable page (T65).
 *
 * These mirror the published catalog envelope + entry (catalog.schema.json) and
 * the emitted analytics artifacts (stats/coverage/plans/providers/leaderboards).
 * Fields the page reads are typed; everything is optional-tolerant because the
 * catalog is additive (version 1) and consumers must ignore unknown keys. */

export type Kind =
  | "CHAT" | "EMBEDDING" | "RERANK" | "IMAGE"
  | "TRANSCRIPTION" | "SPEECH" | "VIDEO" | "MODERATION" | "UNKNOWN";

export type Tier = "Frontier" | "High" | "Mid" | "Light";

export interface Pricing {
  inputPer1M?: number;
  outputPer1M?: number;
  currency?: string;
  unit?: string;
  indicative?: boolean;
  note?: string;
  source?: string;
  lastVerified?: string;
}

export interface BenchmarkScore {
  value?: number;
  source?: string;
  lastVerified?: string;
}

export interface Benchmarks {
  intelligenceIndex?: number;
  arenaElo?: number;
  scores?: Record<string, BenchmarkScore>;
  indicative?: boolean;
  source?: string;
  lastVerified?: string;
}

export interface Performance {
  throughputTps?: number;
  latencyTtftSec?: number;
  indicative?: boolean;
  source?: string;
  lastVerified?: string;
}

export interface Modalities {
  input?: string[];
  output?: string[];
}

export interface ModelEntry {
  vendor: string;
  id: string;
  label?: string;
  kind: Kind | string;
  capabilities?: string[];
  modalities?: Modalities;
  contextWindow?: number;
  maxOutputTokens?: number;
  embeddingDimensions?: number;
  openWeights?: boolean | null;
  parameters?: number | null;
  pricing?: Pricing;
  benchmarks?: Benchmarks;
  performance?: Performance;
  status?: string;
  knowledgeCutoff?: string;
  releaseDate?: string;
  aliases?: string[];
  sources?: string[];
  lastVerified?: string;
  [extra: string]: unknown;
}

export interface Catalog {
  version: number;
  lastUpdated: string;
  vendors: Record<string, ModelEntry[]>;
}

/** Derived, from the SDK's classify() — never stored/invented. */
export interface Classification {
  tags: string[];
  tier: Tier | null;
}

/** One entry in the ⌘K command palette index. */
export interface PaletteEntry {
  type: "model" | "vendor" | "kind";
  vendor?: string;
  kind?: string;
  key?: string;
  id?: string;
  label?: string;
  text: string;
}

/* ── Emitted analytics artifacts (loose but useful shapes) ────────────── */

export interface CoverageMetric { filled: number; rate: number; }
export interface CoverageBucket { total: number; fields: Record<string, CoverageMetric>; }

export interface Stats {
  total?: number;
  byVendor: Record<string, number>;
  byKind: Record<string, number>;
  byCapability: Record<string, number>;
  byInputModality: Record<string, number>;
  byOutputModality?: Record<string, number>;
  coverage: { total?: number; fields: Record<string, CoverageMetric> };
}

export interface Coverage {
  fields: string[];
  overall: CoverageBucket;
  byVendor: Record<string, CoverageBucket>;
}

export interface Plan {
  id?: string;
  name?: string;
  tier?: string;
  priceMonthlyUSD?: number | null;
  annualMonthlyUSD?: number | null;
  features?: string[];
  url?: string;
  source?: string;
  lastVerified?: string;
}
export interface PlansDataset { plans: Record<string, Plan[]>; disclaimer?: string; }

export interface Provider {
  category: string;
  name?: string;
  note?: string;
  catalogVendor?: string;
  apiPricingUrl?: string;
  consumerPlansUrl?: string;
}
export interface ProvidersRegistry { providers: Provider[]; disclaimer?: string; }

export interface LeaderboardEntry {
  vendor: string;
  id: string;
  value: number;
}
export interface Leaderboard {
  label: string;
  metric: string;
  unit: string;
  order: string;
  population: number;
  total: number;
  entries: LeaderboardEntry[];
}
export interface Leaderboards { leaderboards: Leaderboard[]; }
