# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Critical: verify Next.js APIs against the bundled docs

This project pins **Next.js 16.2.6** and **React 19**, which differ from older mental models. Before writing or changing framework code, read the relevant guide bundled in the repo rather than relying on memory:

- Index: `node_modules/next/dist/docs/index.md`
- App Router guides: `node_modules/next/dist/docs/01-app/02-guides/` (e.g. `instant-navigation.md`, `caching-without-cache-components.md`, `migrating-to-cache-components.md`)
- API reference: `node_modules/next/dist/docs/01-app/03-api-reference/`

These docs contain version-specific behavior and AI-agent hints (e.g. instant navigation requires exporting `unstable_instant` from a route, not just `Suspense`). Heed deprecation notices in them.

## Commands

The package manager is **Bun** (`bun.lock` is the only lockfile; `package.json` uses Bun-specific `trustedDependencies`/`ignoreScripts`). Use `bun` for installs.

- `bun install` — install dependencies
- `bun run dev` — start the dev server (http://localhost:3000)
- `bun run build` — production build
- `bun run start` — serve the production build
- `bun run lint` — run ESLint (flat config, `eslint.config.mjs`)

There is no test runner configured yet.

## Architecture

App Router project. All routes and UI live under `app/`:

- `app/layout.tsx` — root layout; loads Geist fonts via `next/font/google` and exposes them as `--font-geist-sans` / `--font-geist-mono` CSS variables.
- `app/page.tsx` — the `/` route.
- `app/globals.css` — global styles.

Conventions:

- **Tailwind CSS v4** is configured entirely in CSS — there is no `tailwind.config.*`. Theme tokens are declared with `@import "tailwindcss"` and an `@theme inline { ... }` block in `app/globals.css`; PostCSS wires it via `@tailwindcss/postcss` in `postcss.config.mjs`.
- **Path alias**: `@/*` maps to the repo root (`tsconfig.json`).
- TypeScript runs in `strict` mode with `noEmit` (Next handles the build).
