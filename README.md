# 👏 OpenClap

OpenClap is **AI agent orchestration on steroids**: a local-first system built to drive large volumes of AI-executable work across projects and subprojects with high-throughput, low-touch execution control.

## Why This Project Exists

OpenClap is primarily for unattended execution windows (for example nights, weekends, or any time you are away). Instead of waiting for manual supervision, the system coordinates AI-executable work across many projects and subprojects while you are not actively interacting with it.

This project focuses on orchestration:

- Cross-project prioritization and deterministic execution control
- Independent subproject scoping for cleaner task separation
- Runtime controls for pause, resume, stop, and safe task updates
- Reusable list management with `$list-*` placeholders (for example language or country code sets)
- Daemon-side list fan-out execution: one task template can run once per list item with per-item retry handling and aggregated results

The product goal is to help users with heavy Codex usage (including Pro subscription workflows) keep task operations organized, traceable, and scalable with OpenClap.

## What It Solves

- High-volume orchestration of AI tasks across many projects and subprojects
- Unattended/off-hours execution without constant manual supervision
- Queue discipline and priority ordering for what runs first
- Fine-grained operational control for long-running and queued work
- Reusable list-driven execution patterns (`$list-*`) so one task definition can scale across many variants
- Predictable lifecycle and audit-friendly execution outcomes for each run

Feature details will evolve over time, but the core objective remains stable: reliable orchestration for AI-driven task management on a local machine.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create local environment configuration:

```bash
cp example.env .env
```

3. Initialize the SQLite database (first run and after pulling new migrations):

```bash
npx prisma migrate deploy
```

If the SQLite file from `.env` does not exist yet, Prisma creates it and applies all migrations.

4. Run the project:

```bash
npm run dev
```

## Technical Notes

This repository is implemented in TypeScript and currently uses Next.js for the application runtime. More components (database, daemon, orchestration APIs, and UI management flows) are introduced incrementally as the implementation plan is completed.

### Environment Variables

Configuration is loaded from `.env`. Example values are provided in `example.env`.

- `SQLITE_DB_PATH`: Local SQLite file path.
- `DATABASE_URL`: SQLite URL format for Prisma-compatible tooling.
- `PORT`: Local server port.
- `SETTINGS_<key>`: Dynamic settings overrides (for example daemon concurrency, message templates, and default project paths).

Settings priority is:

1. DB value (highest)
2. `.env` value from `SETTINGS_<key>`
3. In-code default (lowest)

### Database and Migration Workflow (Developers)

- After pulling latest code, apply migrations to your current local DB:

```bash
npx prisma migrate deploy
```

- When creating a new schema change:

```bash
npm run prisma:migrate:dev -- --name <feature_name>
```

- After creating a migration, re-generate Prisma Client:

```bash
npm run prisma:generate
```

### Maintenance Workflow

- Run `npm run lint` before targeted tests and before the full suite.
- Use focused tests for the area you changed, then run `npm test`.
- Running tasks stay non-editable across UI and server flows.
- Current model policy and the existing spark fast path are documented in [docs/CODEX_MODEL_POLICY.md](docs/CODEX_MODEL_POLICY.md).
