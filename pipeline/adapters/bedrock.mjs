/**
 * Amazon Bedrock source (T4). Calls `ListFoundationModels`
 * (`GET /foundation-models`) and anchors the returned model ids under the `bedrock`
 * vendor row (previously LiteLLM-only for anchoring), mapping Bedrock's
 * input/output modalities onto the kind taxonomy. Opt-in + credential-gated on the
 * standard AWS env vars (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, optional
 * `AWS_SESSION_TOKEN`, region from `AWS_REGION`); unset → skipped, never a failure.
 *
 * Request signing is AWS SigV4, hand-rolled on `node:crypto` to keep the pipeline
 * zero-dependency (no aws-sdk).
 *
 * Marked `partial`: the listing is region-scoped (a model absent here may exist in
 * another region), so it anchors ids but is NOT evidence to remove others.
 *
 * @since 2026.3.4 (T4)
 */
import { createHash, createHmac } from "node:crypto";
import { compact, fetchOrReplay } from "../lib/util.mjs";

const sha256 = (data) => createHash("sha256").update(data, "utf8").digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data, "utf8").digest();

/** Full SigV4 timestamp pair (YYYYMMDDTHHMMSSZ + YYYYMMDD) from the current clock. */
function stamps() {
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: amz, dateStamp: amz.slice(0, 8) };
}

/** Sign a GET request (empty body) and return the headers to send. */
function sigv4Get({ host, path, region, service, accessKey, secretKey, sessionToken }) {
  const { amzDate, dateStamp } = stamps();
  const payloadHash = sha256("");
  const baseHeaders = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (sessionToken) baseHeaders["x-amz-security-token"] = sessionToken;

  const signedHeaders = Object.keys(baseHeaders).sort().join(";");
  const canonicalHeaders = Object.keys(baseHeaders)
    .sort()
    .map((k) => `${k}:${baseHeaders[k]}\n`)
    .join("");
  const canonicalRequest = ["GET", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return {
    ...baseHeaders,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

const KIND_BY_OUTPUT = { EMBEDDING: "EMBEDDING", IMAGE: "IMAGE", VIDEO: "VIDEO" };
const MODALITY = { TEXT: "text", IMAGE: "image", EMBEDDING: "embedding", VIDEO: "video", AUDIO: "audio" };

function kindFrom(outputs) {
  for (const o of outputs) if (KIND_BY_OUTPUT[o]) return KIND_BY_OUTPUT[o];
  return "CHAT";
}

function modalitiesFrom(inputs, outputs) {
  const input = inputs.map((m) => MODALITY[m]).filter(Boolean);
  const output = outputs.map((m) => MODALITY[m]).filter(Boolean);
  const res = {};
  if (input.length) res.input = input;
  if (output.length) res.output = output;
  return Object.keys(res).length ? res : undefined;
}

export default {
  id: "bedrock-api",
  vendor: "bedrock",
  envKey: "AWS_ACCESS_KEY_ID",
  partial: true,
  label: "Bedrock ListFoundationModels",

  async fetch(env, ctx) {
    const region = env.AWS_REGION || env.AWS_DEFAULT_REGION || "us-east-1";
    const host = `bedrock.${region}.amazonaws.com`;
    const path = "/foundation-models";
    // Sign with the live clock; on offline replay the headers are unused.
    const headers = ctx.offline
      ? {}
      : sigv4Get({
          host,
          path,
          region,
          service: "bedrock",
          accessKey: env.AWS_ACCESS_KEY_ID,
          secretKey: env.AWS_SECRET_ACCESS_KEY,
          sessionToken: env.AWS_SESSION_TOKEN,
        });
    return fetchOrReplay(this.id, `https://${host}${path}`, { headers, offline: ctx.offline, when: ctx.when });
  },

  normalize(raw) {
    const models = Array.isArray(raw?.modelSummaries) ? raw.modelSummaries : [];
    return models
      .filter((m) => typeof m?.modelId === "string")
      .map((m) => {
        const inputs = Array.isArray(m.inputModalities) ? m.inputModalities : [];
        const outputs = Array.isArray(m.outputModalities) ? m.outputModalities : [];
        const status = m.modelLifecycle?.status;
        return compact({
          vendor: "bedrock",
          id: m.modelId,
          // modelName is a genuine human label distinct from the id — keep it.
          label: typeof m.modelName === "string" ? m.modelName : undefined,
          kind: kindFrom(outputs),
          modalities: modalitiesFrom(inputs, outputs),
          status: status === "ACTIVE" ? "GA" : status === "LEGACY" ? "DEPRECATED" : undefined,
        });
      });
  },
};
