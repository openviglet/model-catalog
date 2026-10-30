/**
 * ElevenLabs live-API fetcher (Block T / T88). GET /v1/models lists the speech
 * models the API serves, with `can_do_text_to_speech` / `can_do_voice_conversion`
 * flags: both are SPEECH (text→audio and audio→audio). The listing omits Scribe
 * (transcription), and merge scopes removal evidence to the kinds listed (T82), so
 * a TRANSCRIPTION id is never dropped for its absence here.
 *
 * @since 2026.3.4 (T88)
 */
import { compact, fetchOrReplay } from "../lib/util.mjs";

function modalitiesOf(m) {
  if (m.can_do_text_to_speech) return { input: ["text"], output: ["audio"] };
  if (m.can_do_voice_conversion) return { input: ["audio"], output: ["audio"] };
  return undefined;
}

export default {
  id: "elevenlabs-api",
  vendor: "elevenlabs",
  envKey: "ELEVENLABS_API_KEY",
  label: "ElevenLabs /v1/models",

  async fetch(env, ctx) {
    return fetchOrReplay(this.id, "https://api.elevenlabs.io/v1/models", {
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
      offline: ctx.offline,
      when: ctx.when,
    });
  },

  normalize(raw) {
    const models = Array.isArray(raw) ? raw : [];
    return models
      .filter((m) => typeof m?.model_id === "string" && m.model_id)
      .map((m) => {
        // A speech-to-speech model shares its TTS sibling's name; say which one it is.
        const sts = !m.can_do_text_to_speech && m.can_do_voice_conversion;
        const name = typeof m.name === "string" && m.name ? m.name : undefined;
        return compact({
          vendor: "elevenlabs",
          id: m.model_id,
          label: name && sts ? `${name} (speech-to-speech)` : name,
          kind: "SPEECH",
          modalities: modalitiesOf(m),
        });
      });
  },
};
