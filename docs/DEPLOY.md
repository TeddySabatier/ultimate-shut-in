# Deploy

Haven Protocol builds to a folder of static files (`dist/`). Anything that can serve static files can host it. The repository ships a GitHub Pages workflow; this page also covers other hosts and running on a phone during development.

## How the build behaves

- `npm run build` runs `tsc --noEmit` and then `vite build`, producing `dist/` with `index.html`, hashed assets, `manifest.webmanifest` and the service worker `sw.js`.
- `vite.config.ts` sets `base: './'` and the app uses hash routing (`#/quests`...), so every URL is relative and no server rewrite rules are needed. The same `dist/` works at a domain root and under a sub-path such as `/ultimate-shut-in/`.
- The service worker only registers over HTTPS (or `localhost`), which every option below satisfies.

## GitHub Pages

Workflows live in `.github/workflows/`:

- `ci.yml` runs on every push and pull request: lint, typecheck, tests, build, a check that `dist/manifest.webmanifest` and `dist/sw.js` exist, then a Playwright e2e job.
- `deploy.yml` ("Deploy to GitHub Pages") runs on every push to `main` and can also be started by hand (`workflow_dispatch`). It builds and publishes `dist/` to Pages. Live URL: https://teddysabatier.github.io/ultimate-shut-in/

GitHub Pages requires the repository to be public (or a paid GitHub plan). The repository `github.com/TeddySabatier/ultimate-shut-in` is public and Pages is already enabled. If you fork it or start over, do this once:

1. **Make the repo public** (skip if you are on a plan that allows private Pages): Settings > General > Danger zone > Change visibility > Public.
2. **Enable Pages from Actions**: Settings > Pages > Source: **GitHub Actions**.
3. **Push to `main`** (or Actions > "Deploy to GitHub Pages" > Run workflow).
4. When the run finishes, the job summary shows the URL: `https://teddysabatier.github.io/ultimate-shut-in/`.

Re-run the workflow whenever you want to publish a new version. Installed copies update themselves: the service worker uses `autoUpdate`, so the next online launch picks up the new build.

## Any other static host

Netlify, Vercel, Cloudflare Pages, an S3 bucket, nginx, or a USB stick with a local server all work:

```sh
npm ci
npm run build
```

Then upload or point the host at `dist/`. No build-time environment variables, no redirects and no server code are required. Set the build command to `npm run build` and the output directory to `dist` if the host builds for you.

Check a build locally first:

```sh
npm run preview     # serves dist/ with the service worker on http://localhost:4173
```

## Installing on a phone

Once the app is served over HTTPS:

- **Android (Chrome):** open the URL, then menu > "Install app" (or "Add to Home screen").
- **iPhone and iPad (Safari):** open the URL, tap Share, then "Add to Home Screen".

The installed app opens full-screen and works offline after the first load. The save lives in that browser's storage on that device. Installing from a different browser, or the browser tab versus the installed app, can be separate storage on some platforms, so use Settings > Export save and Import save to move a Haven between them.

## Running locally on a phone over your LAN

The dev server already listens on all interfaces (`server.host: true` in `vite.config.ts`); the explicit flag also works:

```sh
npm run dev -- --host
```

Vite prints a `Network:` URL such as `http://192.168.1.20:5173/`. Open it on a phone connected to the same Wi-Fi. Notes:

- Allow Node through your firewall if the phone cannot connect.
- The service worker is disabled in dev mode, and browsers do not allow installing or registering a service worker over plain `http://` on a LAN address, so you will test the UI, not offline behaviour.
- To test the installable, offline build, deploy it to an HTTPS host (see above), or run `npm run build` then `npm run preview -- --host` and open the network URL for a look at the production bundle (still without a service worker, since the page is not HTTPS).
- Debug time travel: set `localStorage['haven.debug'] = '1'` in the browser, reload, and use `window.__haven` (for example `__haven.setNowOffsetMs(86400000)` to jump a day ahead). It is off in production builds unless you opt in this way.
