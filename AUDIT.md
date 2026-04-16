# Repository audit — JOIS (tona-ai)

This document records an honest review of the repository **before** the classroom restructuring (Phase 1), followed by what changed in Phase 2. It is written for course submission and future maintainers.

## Phase 1 — Evaluation criteria

### README quality

The project already had a **long, substantive README** in Russian: clear problem statement, architecture diagram, stack tables, API overview, and quick start. Strengths: real detail on the analysis pipeline and deployment. Weaknesses: the tree at the bottom did not match a standard `src/` layout; some paths and ports (e.g. API URL vs Docker port mapping) were easy to misread; license was stated as MIT in text **without** a `LICENSE` file at the root.

### Folder structure

Before cleanup, the backend lived in top-level `app/`, the frontend in `web/`, helper scripts in `scripts/`, and ad hoc TLS helpers in `nginx-ssl/`. That is workable for a small team but **not** aligned with the course template (`src/`, `docs/`, `tests/`, `assets/`). There was **no** top-level `tests/` for automated checks, and **no** dedicated `assets/` for shared static assets outside the frontend bundle.

### File naming consistency

Python modules followed conventional `snake_case`; React/TypeScript used `PascalCase` for components. No major inconsistency. **Outliers:** a stray empty file `11.12.1` at the repository root (unclear purpose) and a **root** `package-lock.json` with an empty `packages` map (duplicate / mistaken artifact next to `web/package-lock.json`).

### Essential files

- **Dependencies:** `requirements.txt` present for Python; `web/package.json` for the frontend.
- **`.gitignore`:** only under `web/`, **not** at the repository root — risk of committing `.env`, `__pycache__`, or local artifacts.
- **`LICENSE`:** claimed in README but **missing** as a file until Phase 2.
- **`.env.example`:** documented in README but **not** present in the tree; onboarding relied on copying env vars from documentation only.

### Commit history quality

Recent history shows **incremental, feature-oriented commits** (`feat:`, `fix:`) with short English subjects — readable and suitable for a team log. Messages are sometimes terse (e.g. `fix: ms`) but not destructive; overall **acceptable to good** for a student / small project.

---

## Score: **6 / 10** (pre-restructure)

### Justification

| Strength | Weakness |
|----------|----------|
| Strong narrative README and real architecture | No root `.gitignore` / no `LICENSE` file despite MIT claim |
| Clear stack and Docker-based workflow | Layout not refactor-friendly (`app/` + `web/` at root only) |
| Sensible commit messages | Junk / duplicate root files (`11.12.1`, empty root `package-lock.json`) |
| `requirements.txt` + frontend manifest | No `tests/` harness; `.env.example` missing |

The project is **professionally ambitious** in documentation and code organization *inside* `app/`, but the **repository hygiene** (licence, ignore rules, stray files, standard top-level layout) lagged behind. That justifies a **6**: solid core, incomplete “product-grade” repo packaging.

---

## Phase 2 — Cleanup applied (summary)

| Action | Detail |
|--------|--------|
| Layout | Introduced `src/` with `app/`, `web/`, `scripts/` moved under it |
| Docs / ops | Moved `nginx-ssl/` → `docs/nginx-ssl/`; updated `docker-compose.yml` and helper script comments |
| Empty buckets | Added `tests/` (placeholder) and `assets/` (placeholder) per assignment |
| Removed | Deleted `11.12.1` and erroneous root `package-lock.json` |
| Added | Root `.gitignore`, `LICENSE` (MIT), `.env.example` |
| Code | Adjusted `src/app/core/config.py` project root resolution; fixed `sys.path` in scripts for `src/` layout |

**Post-cleanup self-assessment (informal):** the repo is **refactor-ready** and matches the assignment tree; remaining gap is **automated tests** (folder reserved, not yet populated).

---

*Generated as part of the “GitHub Repository Organization” classroom task.*
