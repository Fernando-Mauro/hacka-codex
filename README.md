# FieldLoop

A predictive decision layer for harvest management (John Deere × Tec de
Monterrey hackathon). Two parts in one repo:

- **`app/`** — the Next.js 16 / React 19 frontend (FieldLoop UI: satellite map,
  recommendation panel, 14-day "Ver Futuro" timeline, operator card, lot editor).
- **`backend/`** — a FastAPI + numpy **Monte Carlo decision engine** (robust
  harvest order + Regret Meter). See [`backend/README.md`](backend/README.md).

## Full-stack local dev

Run both — the frontend calls the engine, and **falls back to its built-in
client-side calculations if the backend isn't running**, so either can run alone.

```bash
# Terminal 1 — decision engine (FastAPI) on :8000
cd backend && uv sync && uv run uvicorn fieldloop.api:app --reload --port 8000

# Terminal 2 — frontend on :3000
bun install && bun run dev
```

Open [http://localhost:3000](http://localhost:3000). In the Manager view the
recommendation panel shows a green **"Motor en vivo"** pill and a **Regret Meter**
card when the engine is reachable; it switches to **"Cálculo local"** otherwise.

The frontend reads the backend URL from `NEXT_PUBLIC_API_BASE` (see
[`.env.example`](.env.example); defaults to `http://localhost:8000`).

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
