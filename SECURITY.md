# Security Policy

## Scope

The Model Catalog is a **static, read-only data reference**. What ships is:

- the published **JSON catalog** and its derived artifacts (served as static
  files over HTTPS from GitHub Pages — no server, no database, no auth, no user
  data collected);
- the **browsable page** (plain compiled ES-modules, no runtime dependency; the
  one thing that leaves the page is the optional "Ask" widget, which POSTs a
  question to a separately-operated backend — see [`docs/references/api.md`](docs/references/api.md));
- the **regeneration pipeline** and **client SDKs** (Node built-ins / stdlib
  only, no third-party runtime dependencies).

Because there is no server we operate for the catalog itself, the realistic
security surface is: a supply-chain or integrity issue in the published files, a
flaw in the pipeline/SDK code, or a cross-site issue in the page. Those are all
in scope for a report. **Data accuracy is not a security issue** — a wrong price
or spec is a data correction; please use the
[propose/correct flow](CONTRIBUTING.md) for that.

## Supported versions

The project publishes a single rolling catalog plus a pinned `catalog-v1.json`.
The envelope stays at `version: 1` (additive changes only). Security fixes are
applied to the current `main` and the published site; there are no older release
branches to maintain.

## Reporting a vulnerability

**Please report privately — do not open a public issue for a security report.**

Preferred: use GitHub's **private vulnerability reporting** on this repository
(the **Security** tab → **Report a vulnerability**). If that is unavailable,
contact the maintainers through Viglet at <https://www.viglet.org> and ask for a
private channel before sharing details.

Please include:

- a description of the issue and its impact;
- steps to reproduce (a minimal proof of concept if possible);
- affected artifact or file (page, pipeline, a specific SDK, a published JSON
  endpoint).

### What to expect

- We aim to acknowledge a report within a few business days.
- We will confirm the issue, keep you updated on remediation, and coordinate
  disclosure timing with you.
- With your consent, we are happy to credit you once a fix is published.

Thank you for helping keep the catalog and its consumers safe.
