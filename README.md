# OpenClap

OpenClap is a local-first orchestration system for managing large volumes of AI-executable work across projects and subprojects. It is designed for high-capacity task pipelines where many actions do not require constant human attention.

## Why This Project Exists

OpenClap is primarily for unattended execution windows (for example nights, weekends, or any time you are away). Instead of waiting for manual supervision, the system coordinates AI-executable work across many projects and subprojects while you are not actively interacting with it.

This project focuses on orchestration:

- Prioritizing and controlling task execution across projects
- Structuring work into independent subprojects
- Pausing, resuming, stopping, and adjusting work without losing control
- Running unattended flows with clear status and result visibility

The product goal is to help users with heavy Codex usage (including Pro subscription workflows) keep task operations organized, traceable, and scalable with OpenClap.

## What It Solves

- Project-level and subproject-level task orchestration
- Off-hours AI execution across multiple projects without constant human presence
- Priority management for what should run first
- Operational control over long-running or queued task execution
- Consistent management workflows for task lifecycle actions

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
