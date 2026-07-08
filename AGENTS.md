# Repository Guidelines

## Project Structure & Module Organization

Shared grants configuration utility code lives in `src/`. Tests are colocated as `*.test.js`. Release notes are managed through `.changeset/`.

## Build, Test, and Development Commands

- `npm install`: install dependencies and set up Husky.
- `npm test`: run Vitest with coverage.
- `npm run lint` / `npm run lint:fix`: check or fix linting.
- `npm run format:check` / `npm run format`: check or apply formatting.
- `npm run version`: create a Changeset when changing the published package contract.

## Coding Style & Naming Conventions

Use ES modules and the local Prettier/ESLint settings. Keep utilities small, named after the configuration concept they operate on, and avoid service-specific behaviour in shared helpers.

## Domain Language

Use `CONTEXT.md` as the source of truth for shared grants configuration utility language. Prefer those terms in APIs, tests, docs, and generated changes.

## Developer Addenda

Developers can add their own `AGENTS.local.md` and should be read as an addendum to this file. Keep that file local to your machine and do not commit it.

## Testing Guidelines

Add or update focused unit tests with shared utility changes. Run the relevant Vitest file, then `npm test`, `npm run lint`, and `npm run format:check`.
