"""The read-only catalog client — stdlib ``urllib`` only, no ``requests``."""

from __future__ import annotations

import json
import time
import urllib.request
from typing import Any, Callable, Dict, List, Optional

from .models import ModelEntry

#: Default public endpoint (GitHub Pages, CORS-open).
DEFAULT_BASE_URL = "https://openviglet.github.io/model-catalog"

_USER_AGENT = "openviglet-model-catalog-client/1.0 (+https://github.com/openviglet/model-catalog)"

FetchFn = Callable[[str], Dict[str, Any]]


def _flatten(envelope: Dict[str, Any]) -> List[ModelEntry]:
    """Flatten an envelope's ``vendors`` map into entries carrying their ``vendor``."""
    vendors = (envelope or {}).get("vendors") or {}
    entries: List[ModelEntry] = []
    for vendor, items in vendors.items():
        if not isinstance(items, list):
            continue
        for item in items:
            entries.append(ModelEntry.from_dict(item, vendor=vendor))
    return entries


class ModelCatalogClient:
    """Read-only client for the open, community catalog of AI models.

    The catalog is just JSON over HTTPS; this client removes the boilerplate — URL
    selection (rolling vs pinned ``catalog-vN.json``, or the compact ``index.json``),
    flattening the ``vendors`` map, ``by_kind``/``by_vendor``/``get`` filtering, and
    in-memory caching with an optional TTL. It carries no pricing — identity, kind and
    capability only.

    Args:
        base_url: Endpoint base (default :data:`DEFAULT_BASE_URL`).
        ttl: Cache lifetime in seconds; ``0`` (default) caches until :meth:`refresh`.
        pinned_version: Load ``catalog-vN.json`` instead of the rolling ``catalog.json``.
        compact: Load the compact ``index.json`` (trimmed entries).
        timeout: Per-request socket timeout in seconds.
        fetch: Custom ``fetch(url) -> dict`` (e.g. for tests); default uses ``urllib``.
        now: Monotonic clock for TTL (default :func:`time.monotonic`); injectable for tests.
    """

    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        ttl: float = 0,
        pinned_version: Optional[int] = None,
        compact: bool = False,
        timeout: float = 30,
        fetch: Optional[FetchFn] = None,
        now: Optional[Callable[[], float]] = None,
    ) -> None:
        self._base_url = str(base_url).rstrip("/")
        self._ttl = float(ttl) or 0
        self._pinned_version = pinned_version
        self._compact = bool(compact)
        self._timeout = timeout
        self._fetch = fetch or self._http_get
        self._now = now or time.monotonic
        self._cache: Optional[Dict[str, Any]] = None

    # --- fetching -------------------------------------------------------------

    def _http_get(self, url: str) -> Dict[str, Any]:
        req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
        with urllib.request.urlopen(req, timeout=self._timeout) as resp:  # noqa: S310 (https URL)
            return json.loads(resp.read().decode("utf-8"))

    def _fetch_json(self, path: str) -> Dict[str, Any]:
        return self._fetch("%s/%s" % (self._base_url, path))

    def _primary_path(self) -> str:
        if self._compact:
            return "index.json"
        if self._pinned_version is not None:
            return "catalog-v%s.json" % self._pinned_version
        return "catalog.json"

    def _is_fresh(self) -> bool:
        if self._cache is None:
            return False
        if not self._ttl:
            return True
        return (self._now() - self._cache["fetched_at"]) < self._ttl

    # --- loading --------------------------------------------------------------

    def load(self) -> Dict[str, Any]:
        """Ensure the catalog is loaded (fetch only when empty/stale). Returns the envelope."""
        if self._is_fresh():
            return self._cache["envelope"]
        return self.refresh()

    def refresh(self) -> Dict[str, Any]:
        """Force a fresh fetch, replacing the cache. Returns the envelope."""
        envelope = self._fetch_json(self._primary_path())
        self._cache = {
            "fetched_at": self._now(),
            "envelope": envelope,
            "entries": _flatten(envelope),
        }
        return envelope

    def clear(self) -> None:
        """Drop the in-memory cache; the next access re-fetches."""
        self._cache = None

    # --- accessors ------------------------------------------------------------

    def _entries(self) -> List[ModelEntry]:
        self.load()
        return self._cache["entries"]

    def all(self) -> List[ModelEntry]:
        """All entries across every vendor."""
        return list(self._entries())

    def by_kind(self, kind: str) -> List[ModelEntry]:
        """Entries of a given kind (case-insensitive)."""
        k = str(kind).upper()
        return [e for e in self._entries() if e.kind == k]

    def by_vendor(self, vendor: str) -> List[ModelEntry]:
        """Entries of a given vendor (case-insensitive)."""
        v = str(vendor).lower()
        return [e for e in self._entries() if e.vendor == v]

    def get(self, vendor: str, id: str) -> Optional[ModelEntry]:
        """A single entry by (vendor, id), or ``None``."""
        v = str(vendor).lower()
        for e in self._entries():
            if e.vendor == v and e.id == id:
                return e
        return None

    def vendors(self) -> List[str]:
        """The distinct vendor keys present in the catalog."""
        seen: Dict[str, None] = {}
        for e in self._entries():
            seen.setdefault(e.vendor, None)
        return list(seen)

    # --- faceted slices (smaller pre-filtered payloads) -----------------------

    def fetch_by_kind(self, kind: str) -> List[ModelEntry]:
        """Fetch the ``by-kind/<KIND>.json`` slice directly (smaller payload)."""
        return _flatten(self._fetch_json("by-kind/%s.json" % str(kind).upper()))

    def fetch_by_vendor(self, vendor: str) -> List[ModelEntry]:
        """Fetch the ``by-vendor/<vendor>.json`` slice directly (smaller payload)."""
        return _flatten(self._fetch_json("by-vendor/%s.json" % str(vendor).lower()))

    def fetch_by_capability(self, capability: str) -> List[ModelEntry]:
        """Fetch the ``by-capability/<cap>.json`` slice directly (e.g. ``"reasoning"``)."""
        return _flatten(self._fetch_json("by-capability/%s.json" % str(capability).lower()))

    def fetch_by_modality(self, modality: str) -> List[ModelEntry]:
        """Fetch the ``by-modality/<m>.json`` slice directly (input OR output, e.g. ``"image"``)."""
        return _flatten(self._fetch_json("by-modality/%s.json" % str(modality).lower()))

    def endpoints(self) -> Dict[str, Any]:
        """The discovery manifest (``endpoints.json``) — a map of every published path."""
        return self._fetch_json("endpoints.json")

    # --- aggregate & registry documents ---------------------------------------
    # Separate published artifacts (not ``ModelEntry`` lists), returned as their
    # published shape (a plain dict) — like :meth:`endpoints`. Fetched directly,
    # bypassing the catalog cache.

    def stats(self) -> Dict[str, Any]:
        """Pre-computed aggregate metrics (``stats.json``) — totals, per-facet counts, coverage."""
        return self._fetch_json("stats.json")

    def coverage(self) -> Dict[str, Any]:
        """Per-vendor field-coverage breakdown (``coverage.json``) — where the data has gaps."""
        return self._fetch_json("coverage.json")

    def providers(self) -> Dict[str, Any]:
        """The provider pricing-source registry (``providers.json``) — official pricing pages."""
        return self._fetch_json("providers.json")

    def plans(self) -> Dict[str, Any]:
        """The consumer subscription-plans dataset (``plans.json``) — indicative US list prices."""
        return self._fetch_json("plans.json")

    def aliases(self) -> Dict[str, Any]:
        """The alias resolution map (``aliases.json``) — alias id -> canonical ``{vendor, id}``."""
        return self._fetch_json("aliases.json")

    def changes(self) -> Dict[str, Any]:
        """The change feed (``changes.json``) — models added/removed/lifecycle-changed at last publish."""
        return self._fetch_json("changes.json")
