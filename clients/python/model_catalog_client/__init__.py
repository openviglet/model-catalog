"""Zero-dependency, read-only Python client for the open, community catalog of AI models.

A vendor-neutral, kind-aware list of LLMs, embeddings, rerankers and multimodal models,
published as open JSON over HTTPS (https://openviglet.github.io/model-catalog). Stdlib
only — no ``requests``. Carries no pricing: identity, kind and capability only.

    from model_catalog_client import ModelCatalogClient
    catalog = ModelCatalogClient()
    embeddings = catalog.by_kind("EMBEDDING")
"""

from .client import DEFAULT_BASE_URL, ModelCatalogClient
from .models import KINDS, STATUSES, ModelEntry

__all__ = [
    "ModelCatalogClient",
    "ModelEntry",
    "KINDS",
    "STATUSES",
    "DEFAULT_BASE_URL",
]

__version__ = "1.0.0"
