# eduardofaleiro.me

Personal site: short bio, social links, and a blog. Static site built with
Astro, deployed on Vercel.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run check    # type and template checking
npm test         # unit tests for src/lib
npm run build    # production build into dist/
```

## Writing a post

1. Create `src/content/blog/<slug>.md`. The file name becomes the URL:
   `my-post.md` is served at `/blog/my-post/`.
2. Fill in the frontmatter:

```yaml
---
title: "Post title"
description: "One or two sentences. Used in listings, meta tags and the RSS feed."
pubDate: 2026-09-01
updatedDate: 2026-09-15
tags: ["optional", "tags"]
draft: false
heroImage: "/images/my-post/cover.png"
---
```

`updatedDate` and `heroImage` are both optional. `heroImage` is a path into
`public/`, not a path relative to the post file.

3. Write the body in Markdown.
4. Commit and push to `main`. Vercel builds and publishes automatically.

`draft: true` posts show up in `npm run dev` and are excluded from production
builds and from the RSS feed.

Invalid frontmatter fails the build with an explicit error instead of
publishing a broken page. CI runs `npm run check && npm test && npm run build`
on every push, so that's what gates it.

## Deployment

Push to `main` deploys to production. Every other branch gets a preview URL.

### DNS

In the domain registrar for `eduardofaleiro.me`:

| Type | Name | Value |
|---|---|---|
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

Confirm these values against the exact records Vercel shows under
**Project → Settings → Domains**, which are authoritative.
