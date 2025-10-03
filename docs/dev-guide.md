# Developer Guide

## Architecture Overview
- **Frontend**: Static assets in `public/`, organized by feature (`js/`, `css/`, `html`).
- **Server**: Express app (`server.js`, `routes/`) providing REST APIs. Forecast DB scripts live in `sql/`.
- **Data flow**: UI loads forecast/version metadata via `API.*` modules, renders tables through `render-tables.js`, and applies updates with `update-calculations.js`. Production baseline UI syncs with `/api/production-config`.

## Key Modules
- `public/js/main.js`: App state, tab switching, and glue logic.
- `public/js/production-baseline.js`: Baseline helpers (averages, layout sync, toolbar wiring).
- `public/js/render-tables.js`: Generates HTML tables for headcount and production tabs.
- `public/js/update-calculations.js`: Recomputes derived values after edits.
- `routes/productionConfig.js`: CRUD for production seasonality/growth settings.

## Common Commands
- List production-related code: `rg "production" public/js`
- Narrow to baseline layout: `rg "baseline" public/js`
- View part of a large file: `powershell -ExecutionPolicy Bypass -File scripts/view-snippet.ps1 -Path public/js/main.js -Skip 450 -Take 120`
- Tail API logs during development: `Get-Content logs/app.log -Wait`

## Workflow Tips
1. **Targeted context**: Copy only the relevant section when sharing with Codex (use `Select-Object -Skip/-First` or `rg -n`).
2. **Feature flags**: Keep experiments in `temp_*` files and ensure they stay gitignored (`temp_baseline.js`). Promote stable code by moving it into `public/js/production-baseline.js` (or other feature folders) and removing the temp file.
3. **Tab hygiene**: Close unused IDE tabs before starting a session so the runner mirrors only the files you care about.
4. **Logs & dist**: `logs/` and `dist/` are ignored by Git; prune old artifacts with `Remove-Item dist/* -Recurse` when they get bulky.
5. **Testing**: Use `npm run lint` and `npm test` (add as needed) before pushing to keep revisions focused.

## Next Refactors
- Convert inline event wiring to module imports once we migrate to bundling.
- Define shared helpers (`slugify`, `formatThousands`) in a small utility module under `public/js/utils/`.
- Add thin API wrapper tests for `routes/productionConfig.js`.

Keeping this guide updated lets us reference summaries instead of reloading large code blobs during future Codex sessions.

## Helper Scripts
- `scripts/view-snippet.ps1`: Quick file slicer (`-Path`, optional `-Skip`, `-Take`).
