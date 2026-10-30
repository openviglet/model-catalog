"""Refuse `Write` over an existing non-empty file.

`Write` reports "updated successfully" when it replaces a file, and that word is the only
warning the caller gets. In the sibling `pportal` repo, where this hook was written, that
destroyed roughly 700 lines across four occasions -- one of them committed before anyone
noticed, because the tool's own report is what made the loss invisible.

Every one had the same shape: a class was written under a name that described the
behaviour, and an unrelated file already held that name. An obvious name is usually taken.

So this refuses the call and names `Edit` instead. Deliberate replacement stays available:
delete the file first, which is an act nobody performs by accident.

Two rules from `roadkeep-launch.py` hold here too, and the second is the more important:

  * **Never block a turn.** Any failure -- unreadable stdin, malformed JSON, a path that will
    not resolve -- exits 0 and emits nothing. A hook that denies on its own bug is worse than
    no hook, because the denial reads as a finding about the file.
  * **The exit code is the protocol.** 2 denies and stderr carries the reason to the model;
    0 permits. Nothing else is written on any path.
"""

from __future__ import annotations

import json
import os
import sys

#: Trees whose contents are generated, vendored or scratch. A `Write` over one of these is
#: replacing output, not somebody's source, and the whole failure this guards against is
#: losing authored work.
EXEMPT_PARTS = (
    ".roadkeep",
    "build",
    "dist",
    "node_modules",
    "obj",
    "bin",
    ".ruff_cache",
    ".git",
)

DENY = 2
ALLOW = 0


def _exempt(path: str) -> bool:
    """True where the path sits under a generated or vendored tree.

    Matches on path *parts* rather than a substring, so a legitimate file whose name merely
    contains one of these words is not exempted by accident.
    """
    parts = {p.lower() for p in os.path.normpath(path).split(os.sep)}
    return any(part in parts for part in EXEMPT_PARTS)


def main() -> int:
    try:
        # `lstrip` the BOM rather than `json.load(sys.stdin)`: PowerShell 5.1 prepends one when
        # it pipes to a native command, so a hook tested from a PS prompt would otherwise fail
        # open and read as passing. The harness itself sends clean bytes.
        payload = json.loads(sys.stdin.read().lstrip("﻿"))
    except Exception:
        return ALLOW

    if payload.get("tool_name") != "Write":
        return ALLOW

    tool_input = payload.get("tool_input") or {}
    path = tool_input.get("file_path")
    if not isinstance(path, str) or not path:
        return ALLOW

    try:
        if not os.path.isfile(path):
            return ALLOW
        size = os.path.getsize(path)
    except Exception:
        return ALLOW

    # An empty file is a placeholder somebody already created; replacing it loses nothing.
    if size == 0 or _exempt(path):
        return ALLOW

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            lines = sum(1 for _ in handle)
    except Exception:
        lines = 0

    measured = f"{lines} lines" if lines else f"{size} bytes"

    sys.stderr.write(
        f"Write refused: {path} already exists and holds {measured}.\n"
        "\n"
        "Write REPLACES it and reports \"updated successfully\", which is why this is a hook\n"
        "and not a rule -- that report is the only warning, and it has cost a sibling repo\n"
        "~700 lines across four occasions.\n"
        "\n"
        "  * To change part of the file, use Edit.\n"
        "  * If you meant to create something new, the name is taken -- read the file, then\n"
        "    pick a name no existing file holds.\n"
        "  * If you truly mean to replace it wholesale, delete it first; that is deliberate\n"
        "    in a way this call is not.\n"
    )
    return DENY


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        # Never block a turn: a crash here must not read as a finding about the file.
        sys.exit(ALLOW)
