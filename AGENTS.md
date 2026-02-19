# AGENTS - Codex Tasks Project Rules

## Project Context

This project is a local-first Codex orchestration system for managing projects, subprojects, and task execution workflows with server-coordinated state changes and daemon-based processing.

## Core Implementation Rules

1. Use TypeScript across all project layers.
2. Keep shared contracts in a common shared module and avoid duplicate interfaces/types across UI, API, and daemon.
3. Build UI with shadcn/ui v4 components and use `lucide-react` for icons.
4. Route all state-changing actions through server APIs; avoid direct client-side state mutation as source of truth.
5. Follow DB migration policy: one migration per feature task; never split one feature’s schema change across multiple migrations.
6. For each new feature:
   - Run linter checks first and fix all lint issues before running tests.
   - Run feature-specific tests after lint passes.
   - After feature tests pass, run the full test suite.
7. Tasks that are currently executing must be locked from edits in UI/API behavior.

## Architecture Direction

- `src/`: web UI and server API routes.
- `scripts/daemon/`: daemon runtime, polling, and workers.
- `shared/`: cross-layer interfaces, enums, and DTO contracts.

## Quality Expectations

- Prevent duplicated task execution with server-side atomic claim behavior.
- Preserve full task response payloads from Codex execution.
- Use clear and predictable status transitions for task lifecycle.
