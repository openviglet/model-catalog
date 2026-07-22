/**
 * Type declarations for @openviglet/model-catalog-client. Hand-written (the package
 * ships plain ESM — zero build step, matching the repo's zero-dependency ethos).
 * Mirrors the published `ModelEntry` contract; unknown fields are tolerated via the
 * index signature so a future additive-schema field never breaks type-checking.
 */

export declare const DEFAULT_BASE_URL: string;

/** The published model-kind taxonomy. */
export type Kind =
  | "CHAT"
  | "EMBEDDING"
  | "RERANK"
  | "IMAGE"
  | "TRANSCRIPTION"
  | "SPEECH"
  | "VIDEO"
  | "MODERATION"
  | "UNKNOWN";

export declare const KINDS: readonly Kind[];

/** Lifecycle stage (optional, additive). */
export type Status = "PREVIEW" | "GA" | "DEPRECATED" | "RETIRED";

export interface Modalities {
  input?: Array<"text" | "image" | "audio" | "video" | "pdf">;
  output?: Array<"text" | "image" | "audio" | "video" | "embedding">;
}

/**
 * Optional INDICATIVE US list price (Block F). A reference only — verify with the
 * vendor; never an authoritative, per-contract, per-region or negotiated quote.
 * Provenance-gated (`source` + `lastVerified`) and never invented.
 */
export interface Pricing {
  inputPer1M?: number;
  outputPer1M?: number;
  currency?: "USD";
  unit?: string;
  /** Always `true` — an indicative US list reference, not authoritative. */
  indicative: true;
  note?: string;
  source: string;
  lastVerified: string;
  [key: string]: unknown;
}

/** A single cited per-domain benchmark score (Block I), e.g. `reasoning`/`coding`/`math`. */
export interface BenchmarkScore {
  value: number;
  /** Per-domain provenance override; falls back to the parent `Benchmarks.source`. */
  source?: string;
  lastVerified?: string;
}

/**
 * Optional CITED third-party capability numbers (Block I) — a reference to a public,
 * citable leaderboard (e.g. Artificial Analysis / LMArena), NOT our quality verdict.
 * Provenance-gated and never invented; verify at the source.
 */
export interface Benchmarks {
  intelligenceIndex?: number;
  arenaElo?: number;
  /** Per-domain cited scores keyed by domain (recommended: reasoning, coding, math). */
  scores?: Record<string, BenchmarkScore>;
  /** Always `true` — indicative cited numbers, not an authoritative verdict. */
  indicative: true;
  note?: string;
  source: string;
  lastVerified: string;
  [key: string]: unknown;
}

/**
 * Optional CITED speed metrics (Block I) — the "fast vs capable" axis alongside
 * `benchmarks`. A reference to a public measurement, NOT our own benchmark.
 * Provenance-gated and never invented; verify at the source.
 */
export interface Performance {
  throughputTps?: number;
  latencyTtftSec?: number;
  /** Always `true` — indicative cited measurements, not authoritative. */
  indicative: true;
  note?: string;
  source: string;
  lastVerified: string;
  [key: string]: unknown;
}

/** A catalog model entry (as flattened by this client — always carries `vendor`). */
export interface ModelEntry {
  id: string;
  label: string;
  kind: Kind;
  vendor: string;
  contextWindow?: number;
  embeddingDimensions?: number;
  capabilities?: string[];
  /** True when the weights are openly downloadable, false when proprietary API-only (Block I). */
  openWeights?: boolean;
  /** Total parameter count, only when the vendor has publicly disclosed it (Block I). */
  parameters?: number;
  deprecated?: boolean;
  maxOutputTokens?: number;
  modalities?: Modalities;
  knowledgeCutoff?: string;
  releaseDate?: string;
  aliases?: string[];
  status?: Status;
  sources?: string[];
  lastVerified?: string;
  /** Indicative US list price — a reference only, not authoritative (Block F). */
  pricing?: Pricing;
  /** Cited third-party capability numbers — a reference, not our verdict (Block I). */
  benchmarks?: Benchmarks;
  /** Cited speed metrics — a reference to a public measurement (Block I). */
  performance?: Performance;
  /** Additive-schema tolerance: unknown fields pass through untyped. */
  [key: string]: unknown;
}

/** The catalog envelope as served by the endpoint. */
export interface CatalogEnvelope {
  $schema?: string;
  version: number;
  lastUpdated: string;
  source?: string;
  vendors: Record<string, ModelEntry[]>;
  [key: string]: unknown;
}

/** Per-field fill metric — how many entries carry a field and the resulting rate. */
export interface CoverageMetric {
  filled: number;
  rate: number;
}

/** Aggregate metrics (`stats.json`) — pre-computed counts + field coverage, derived at emit. */
export interface Stats {
  version: number;
  lastUpdated: string;
  source: string;
  totals: {
    models: number;
    vendors: number;
    kinds: number;
    capabilities: number;
  };
  byVendor: Record<string, number>;
  byKind: Record<string, number>;
  byCapability: Record<string, number>;
  byInputModality: Record<string, number>;
  byOutputModality: Record<string, number>;
  coverage: { total: number; fields: Record<string, CoverageMetric> };
  [key: string]: unknown;
}

/** Per-vendor (and overall) field-coverage breakdown (`coverage.json`). */
export interface Coverage {
  version: number;
  lastUpdated: string;
  source: string;
  /** The field order the `fields` maps use. */
  fields: string[];
  overall: { total: number; fields: Record<string, CoverageMetric> };
  byVendor: Record<string, { total: number; fields: Record<string, CoverageMetric> }>;
  [key: string]: unknown;
}

/** A provider pricing-source registry entry (`providers.json`). URLs only — no prices. */
export interface Provider {
  id: string;
  name: string;
  category: "model-creator" | "hyperscaler" | "inference-provider" | "aggregator";
  /** The catalog vendor key this provider maps to, or `null` when not yet in the catalog. */
  catalogVendor?: string | null;
  apiPricingUrl?: string;
  consumerPlansUrl?: string;
  note?: string;
  [key: string]: unknown;
}

/** The provider pricing-source registry (`providers.json`). */
export interface ProvidersRegistry {
  $schema?: string;
  version: number;
  lastUpdated: string;
  source: string;
  disclaimer?: string;
  providers: Provider[];
  [key: string]: unknown;
}

/**
 * A consumer subscription plan (`plans.json`). Carries an INDICATIVE US list price
 * (a reference only — verify with the vendor); provenance-gated, never invented.
 */
export interface Plan {
  id: string;
  name: string;
  product?: string;
  tier?: string;
  priceMonthlyUSD?: number;
  annualMonthlyUSD?: number;
  currency?: "USD";
  features?: string[];
  url?: string;
  /** Always `true` — an indicative US list reference, not authoritative. */
  indicative: true;
  note?: string;
  source: string;
  lastVerified: string;
  vendor: string;
  [key: string]: unknown;
}

/** The consumer subscription-plans dataset (`plans.json`), keyed by consumer brand. */
export interface PlansDataset {
  $schema?: string;
  version: number;
  lastUpdated: string;
  source: string;
  disclaimer?: string;
  plans: Record<string, Plan[]>;
  [key: string]: unknown;
}

/** An alias resolution target — the canonical `(vendor, id)` an alias points to. */
export interface AliasTarget {
  vendor: string;
  id: string;
}

/** The alias resolution map (`aliases.json`) — alias id → its canonical entry. */
export interface Aliases {
  version: number;
  lastUpdated: string;
  source: string;
  count: number;
  aliases: Record<string, AliasTarget>;
  [key: string]: unknown;
}

/** The `endpoints.json` discovery manifest. */
export interface EndpointsManifest {
  version: number;
  lastUpdated: string;
  source: string;
  latest: string;
  pinned: Record<string, string>;
  index: string;
  schema: string;
  byKind: Record<string, string>;
  byVendor: Record<string, string>;
  [key: string]: unknown;
}

export interface ModelCatalogClientOptions {
  /** Endpoint base (default DEFAULT_BASE_URL). */
  baseUrl?: string;
  /** Cache lifetime in ms; 0 = cache until refresh() (default 0). */
  ttlMs?: number;
  /** Load the pinned `catalog-vN.json` instead of rolling `catalog.json`. */
  pinnedVersion?: number;
  /** Load the compact `index.json` (trimmed entries) instead of the full catalog. */
  compact?: boolean;
  /** Custom fetch (default global fetch). */
  fetch?: typeof fetch;
  /** Clock for TTL (default Date.now); injectable for tests. */
  now?: () => number;
}

export declare class ModelCatalogClient {
  constructor(options?: ModelCatalogClientOptions);
  /** Ensure the catalog is loaded (fetch only when empty or stale). Returns the raw envelope. */
  load(): Promise<CatalogEnvelope>;
  /** Force a fresh fetch, replacing the cache. Returns the raw envelope. */
  refresh(): Promise<CatalogEnvelope>;
  /** Drop the in-memory cache; the next access re-fetches. */
  clear(): void;
  /** All entries across every vendor. */
  all(): Promise<ModelEntry[]>;
  /** Entries of a given kind (case-insensitive). */
  byKind(kind: Kind | string): Promise<ModelEntry[]>;
  /** Entries of a given vendor (case-insensitive). */
  byVendor(vendor: string): Promise<ModelEntry[]>;
  /** A single entry by (vendor, id), or null if absent. */
  get(vendor: string, id: string): Promise<ModelEntry | null>;
  /** The distinct vendor keys present in the catalog. */
  vendors(): Promise<string[]>;
  /** Fetch the `by-kind/<KIND>.json` slice directly (smaller payload). */
  fetchByKind(kind: Kind | string): Promise<ModelEntry[]>;
  /** Fetch the `by-vendor/<vendor>.json` slice directly (smaller payload). */
  fetchByVendor(vendor: string): Promise<ModelEntry[]>;
  /** The discovery manifest (`endpoints.json`). */
  endpoints(): Promise<EndpointsManifest>;
  /** Pre-computed aggregate metrics (`stats.json`). */
  stats(): Promise<Stats>;
  /** Per-vendor field-coverage breakdown (`coverage.json`). */
  coverage(): Promise<Coverage>;
  /** The provider pricing-source registry (`providers.json`). */
  providers(): Promise<ProvidersRegistry>;
  /** The consumer subscription-plans dataset (`plans.json`). */
  plans(): Promise<PlansDataset>;
  /** The alias resolution map (`aliases.json`). */
  aliases(): Promise<Aliases>;
}

export default ModelCatalogClient;
