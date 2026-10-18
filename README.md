# Ultimate Shut-In

A real-life quest RPG PWA inspired by The Ultimate Shut-In: do things in real life, level up in the game.

Mobile-first, installable, works offline, deploys to GitHub Pages.

## Stack

Vite 6 · React 18 · TypeScript (strict) · Zustand (persist + immer) · React Router (hash) · CSS modules · vite-plugin-pwa (Workbox) · Vitest + Testing Library · ESLint

## Run

```sh
npm install
npm run dev        # http://localhost:5173
```

## Scripts

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Dev server with HMR                            |
| `npm run build`     | Typecheck + production build to `dist/`        |
| `npm run preview`   | Serve `dist/` locally (service worker enabled) |
| `npm test`          | Run unit tests once                            |
| `npm run test:watch`| Run tests in watch mode                        |
| `npm run lint`      | ESLint                                         |
| `npm run typecheck` | `tsc --noEmit`                                 |
| `npm run icons`     | Regenerate placeholder PWA icons               |

## Layout

```
src/
  components/   reusable UI (AppShell, TabBar, Panel, ...)
  screens/      one component per route
  state/        Zustand stores (persisted to localStorage)
  game/         pure game logic, no React
  hooks/        React hooks (useInstallPrompt, ...)
  pwa/          service-worker registration
  styles/       tokens.css (design tokens) + global.css
  assets/       images, fonts, sounds
public/icons/   PWA icons
docs/research/  design research
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/` to GitHub Pages. Enable Pages with source "GitHub Actions" in the repo settings once.
