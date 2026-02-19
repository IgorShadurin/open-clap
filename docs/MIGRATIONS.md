# Migration Policy

## Rules

1. Every schema change must be introduced through a Prisma migration.
2. Use exactly one migration per feature task.
3. Do not split one feature's schema updates across multiple migrations.
4. Do not modify an already-applied migration; create a new migration for follow-up changes.

## Naming Convention

Use clear, feature-oriented migration names:

- `init`
- `add_task_execution_tables`
- `add_immediate_action_status_tracking`
- `add_settings_overrides`

## Workflow

1. Update `prisma/schema.prisma`.
2. Run `npm run prisma:migrate:dev -- --name <feature_name>`.
3. Run `npm run prisma:generate`.
4. Run lint + tests.
