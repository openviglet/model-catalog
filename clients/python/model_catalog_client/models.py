"""Typed models mirroring the published ``ModelEntry`` contract.

Stdlib-only (``dataclasses``). Unknown JSON fields are tolerated — they are kept in
``ModelEntry.extra`` — so a future additive-schema field never breaks an old client.
JSON uses camelCase keys; the dataclass exposes Pythonic snake_case attributes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

#: The published model-kind taxonomy.
KINDS = (
    "CHAT",
    "EMBEDDING",
    "RERANK",
    "IMAGE",
    "TRANSCRIPTION",
    "SPEECH",
    "VIDEO",
    "MODERATION",
    "UNKNOWN",
)

#: Optional lifecycle stages.
STATUSES = ("PREVIEW", "GA", "DEPRECATED", "RETIRED")

# JSON (camelCase) -> dataclass attribute (snake_case) for the known fields.
_FIELD_MAP = {
    "id": "id",
    "label": "label",
    "kind": "kind",
    "vendor": "vendor",
    "contextWindow": "context_window",
    "embeddingDimensions": "embedding_dimensions",
    "capabilities": "capabilities",
    "openWeights": "open_weights",
    "parameters": "parameters",
    "deprecated": "deprecated",
    "maxOutputTokens": "max_output_tokens",
    "modalities": "modalities",
    "knowledgeCutoff": "knowledge_cutoff",
    "releaseDate": "release_date",
    "aliases": "aliases",
    "status": "status",
    "sources": "sources",
    "lastVerified": "last_verified",
    "pricing": "pricing",
    "benchmarks": "benchmarks",
    "performance": "performance",
}


@dataclass
class ModelEntry:
    """A single catalog model entry (always carries ``vendor`` after flattening)."""

    id: str
    label: str
    kind: str
    vendor: str
    context_window: Optional[int] = None
    embedding_dimensions: Optional[int] = None
    capabilities: Optional[List[str]] = None
    #: True when the weights are openly downloadable, False when proprietary API-only (Block I).
    open_weights: Optional[bool] = None
    #: Total parameter count, only when the vendor has publicly disclosed it (Block I).
    parameters: Optional[int] = None
    deprecated: Optional[bool] = None
    max_output_tokens: Optional[int] = None
    modalities: Optional[Dict[str, List[str]]] = None
    knowledge_cutoff: Optional[str] = None
    release_date: Optional[str] = None
    aliases: Optional[List[str]] = None
    status: Optional[str] = None
    sources: Optional[List[str]] = None
    last_verified: Optional[str] = None
    #: Indicative US list price — a reference only, not authoritative (Block F). Kept as the
    #: raw dict (like ``modalities``): {inputPer1M?, outputPer1M?, currency, unit, indicative,
    #: note?, source, lastVerified}.
    pricing: Optional[Dict[str, Any]] = None
    #: Cited third-party capability numbers — a reference, not our verdict (Block I). Raw dict:
    #: {intelligenceIndex?, arenaElo?, scores?, indicative, note?, source, lastVerified}.
    benchmarks: Optional[Dict[str, Any]] = None
    #: Cited speed metrics — a reference to a public measurement (Block I). Raw dict:
    #: {throughputTps?, latencyTtftSec?, indicative, note?, source, lastVerified}.
    performance: Optional[Dict[str, Any]] = None
    #: Any keys not in the known schema (additive-schema tolerance).
    extra: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any], vendor: Optional[str] = None) -> "ModelEntry":
        """Build an entry from a raw JSON object, backfilling ``vendor`` when absent."""
        known: Dict[str, Any] = {}
        extra: Dict[str, Any] = {}
        for key, value in data.items():
            attr = _FIELD_MAP.get(key)
            if attr is not None:
                known[attr] = value
            else:
                extra[key] = value
        if not known.get("vendor") and vendor is not None:
            known["vendor"] = vendor
        # id/label/kind/vendor are required by the schema; fail loudly if missing.
        return cls(extra=extra, **known)
