## CodexSecondBrain Sync — 2026-04-23 09:49 PDT

### Conversation (condensed)
- Requested a sync note covering recent EcoScan updates since the last automation run (`2026-04-19T04:47:52Z`).

### Project Updates (git since last run)
- `main` is now at `acb9b8a` (2026-04-22): adds Vite proxy/config work and related frontend/server wiring.
- `main` includes desktop-run fixes (`a4c1b0b`, 2026-04-22).
- `main` includes the `ui-update` restoration/enhancement merge (`08f5947`, 2026-04-20).
- Branch state snapshot:
  - `main` tracks `origin/main` (clean working tree).
  - `ui-update` is `ahead 1` vs `origin/ui-update` (local tip `a49ae9c`).
  - `photo-ai-system` is `ahead 1` vs `origin/photo-ai-system` (local tip `6257e32`).

### Key Decisions (reinforced)
- Keep both demo launch paths:
  - Browser: `./run.sh`
  - Native window: `./run-desktop.sh`
- Keep internal scoring logic, but present user-facing threat as `Low / Medium / High` with concrete action guidance.

### Notable File/Feature Changes (high signal)
- Frontend/dev wiring:
  - `frontend/vite.config.ts` (+ generated config files) and UI updates in `frontend/src/App.tsx`.
  - Backend routing adjustments in `src/ecoscan/server.py` to support the new frontend dev setup.
- “Apr 19 restoration + enhancement” content (now merged into `main`):
  - Expanded species profiles + action items in `src/ecoscan/pipeline.py`.
  - Wildlife image bank refresh in `frontend/src/App.tsx`.
  - New hero animation component: `frontend/src/components/ui/animated-hero.tsx`.
  - New docs: `UPLOAD_SYSTEM_GUIDE.md`, `SESSION_SUMMARY_APR19.md`.

### Risks / Cleanup Gaps
- **Repo bloat risk:** `frontend/node_modules/` content (e.g. `fsevents`) and build artifacts (e.g. `*.tsbuildinfo`, generated `vite.config.js`, `tailwind.config.js`) appear committed on `main` at `acb9b8a`.
  - This can create cross-platform issues and makes diffs noisy; should be removed and covered by `.gitignore`.
- **Divergence risk:** `ui-update` and `photo-ai-system` are ahead of their `origin/*` branches; push or consolidate to avoid losing work.

### Next Actions
- Decide “demo canonical” branch (`main` vs `ui-update`), then push any ahead-of-origin branches you want to keep.
- Remove committed `frontend/node_modules/` and generated build outputs; update `.gitignore`; reinstall + rebuild to validate.
- Smoke test both launch paths after cleanup: `./run.sh` and `./run-desktop.sh`.
