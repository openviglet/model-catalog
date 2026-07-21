/**
 * SourceAdapter registry (Block BD / T765). Each adapter implements the contract
 *   { id, vendor|null, envKey|null, label, fetch(env, ctx), normalize(raw) -> draft[] }
 * where a draft is a partial ModelEntry carrying its target `vendor` + `id`.
 * Order here is display-only; precedence lives in lib/merge.mjs.
 *
 * An adapter may set `partial: true` — its listing is environment-scoped/bounded
 * (local `ollama list`, region-scoped Bedrock, a filtered HuggingFace query), so it
 * anchors the ids it returns but is NOT positive evidence to remove others (T4).
 *
 * @since 2026.3.4 (T765)
 */
import openai from "./openai.mjs";
import anthropic from "./anthropic.mjs";
import gemini from "./gemini.mjs";
import cohere from "./cohere.mjs";
import mistral from "./mistral.mjs";
import ollama from "./ollama.mjs";
import bedrock from "./bedrock.mjs";
import huggingface from "./huggingface.mjs";
import litellm from "./litellm.mjs";

export const ADAPTERS = [openai, anthropic, gemini, cohere, mistral, ollama, bedrock, huggingface, litellm];
