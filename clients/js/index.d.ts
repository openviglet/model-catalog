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

/** A catalog model entry (as flattened by this client — always carries `vendor`). */
export interface ModelEntry {
  id: string;
  label: string;
  kind: Kind;
  vendor: string;
  contextWindow?: number;
  embeddingDimensions?: number;
  capabilities?: string[];
  deprecated?: boolean;
  maxOutputTokens?: number;
  modalities?: Modalities;
  knowledgeCutoff?: string;
  releaseDate?: string;
  aliases?: string[];
  status?: Status;
  sources?: string[];
  lastVerified?: string;
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
}

export default ModelCatalogClient;
