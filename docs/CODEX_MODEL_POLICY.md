# Codex Model Policy

OpenClap currently treats model selection as an execution policy, not a feature flag surface.

## Default task model

- New tasks default to `gpt-5.3-codex`.
- Stored task-form preferences that still point at `gpt-5.3-codex-spark` are normalized back to `gpt-5.3-codex` when loaded.
- `gpt-5.3-codex-spark` remains selectable for tasks that explicitly need it.

## Fast path

There is no separate "fast mode" toggle in the product.

The current fast path is the existing combination of:

- `gpt-5.3-codex-spark` as the selected model
- lower reasoning levels when a task does not need heavy reasoning

This keeps the configuration explicit in task data and avoids introducing another runtime switch that would need to stay in sync with model-specific execution logic.

## Usage-limit behavior

- Daemon claim decisions always respect Codex usage allowance checks before claiming queued work.
- Per-model five-hour and weekly limits can block individual models even when general allowance is still available.
- Spark tasks may fall back to `gpt-5.3-codex` with `medium` reasoning when spark is blocked and standard codex allowance is still executable.
- If all available models are blocked or below the remaining threshold, daemon execution pauses instead of skipping around the queue.

## Maintenance guidance

- Run `npm run lint` before targeted tests.
- Run focused tests for the touched area before `npm test`.
- Keep model aliases and lock rules centralized in shared helpers so UI, API, and daemon code do not drift.
