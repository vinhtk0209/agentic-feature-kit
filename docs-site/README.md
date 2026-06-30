# docs-site

Documentation site for **claude-workflow-kit**, built with [Nextra](https://nextra.site)
(Next.js + MDX). Gap **C-02**.

## Develop

```bash
cd docs-site
npm install
npm run dev        # http://localhost:3000
```

## Build

```bash
npm run build
npm start          # serve the production build
```

## Content

All content is MDX under `pages/`. Navigation order is controlled by `_meta.json` files.

```
pages/
  index.mdx            Getting Started (home)
  getting-started.mdx
  commands/            Commands Reference (one page per slash command)
  integrations.mdx
  dashboard.mdx
  api-reference.mdx
```

Edit any `.mdx` file and the dev server hot-reloads. To add a page, drop a new `.mdx` file
and (optionally) add a label to the sibling `_meta.json`.

## Deploy

- **Vercel (recommended):** zero-config — import the repo, set the project root to
  `docs-site/`. Nothing else to configure.
- **GitHub Pages (static export):** in `next.config.mjs`, uncomment `output: 'export'` and
  set `basePath` to your repo name, then `npm run build` and publish the `out/` folder.

> This site is **not** part of the kit's `npm run sync` (it ships only in the kit repo, not
> the target repos).
