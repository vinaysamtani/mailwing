# Mailwing site

Static marketing site for [Mailwing](https://github.com/vinaysamtani/mailwing), built with [Astro](https://astro.build) and deployed to Cloudflare Pages at **mailwing.app**.

## Develop

```sh
cd site
npm install
npm run dev          # http://localhost:4321
```

## Build

```sh
npm run build        # output to ./dist
npm run preview      # serve ./dist locally
```

## Deploy

Cloudflare Pages auto-deploys on push to `main`.

- Root directory: `site`
- Build command: `npm run build`
- Output directory: `dist`
- Env vars:
  - `NODE_VERSION=20`
  - `SITE_URL=https://mailwing.app` (or `https://mailwing.pages.dev` initially)
  - `GITHUB_TOKEN` (optional fine-grained PAT, public-repo read) — bumps Releases API rate limit from 60/hr → 5000/hr.

## Domain

`mailwing.app` is not yet purchased. Until it is, the site lives at `mailwing.pages.dev` and works fine. DNS steps:

1. Purchase `mailwing.app` (Cloudflare Registrar recommended for free apex CNAME flattening).
2. Cloudflare Pages → Custom domains → add `mailwing.app` + `www.mailwing.app`.
3. Bulk redirect: `www.mailwing.app/*` → `https://mailwing.app/$1` (301).
4. Flip `SITE_URL` env var to `https://mailwing.app`, trigger rebuild.
