# eduardofaleiro.dev

A static Astro site: personal blog plus social links, deployed on Vercel.

## Hard constraints

No Tailwind. No UI framework (React, Vue, Svelte, etc). No client-side JS.
Plain CSS, using the custom properties defined in `src/styles/global.css`.
Zero new dependencies without a good reason.

## Commands

`npm run dev`, `npm run check`, `npm test`, `npm run build`. CI runs the
last three (check, test, build) on every push.

Run the dev server non-interactively with `astro dev --background`, and
stop it with `astro dev stop`.

## Where things live

Posts live in `src/content/blog/*.md`, validated by `src/content.config.ts`.
`selectPublished` in `src/lib/posts.ts` is the single decider of what is
published — every page must go through it. `src/data/social.ts` is the
single source for social links. `src/layouts/Base.astro` owns `<head>`,
the header, and the footer.

Posts with `draft: true` show in `npm run dev` and never in production or
the RSS feed.

## Languages

Every post declares `lang: en` or `lang: pt` — the field is required, so a
post without it fails the build. English lives at the root (`/blog/...`);
Portuguese lives under `/pt/` (`/pt/blog/...`). Each language has its own
index and its own RSS feed.

Translating is optional and there is no fallback: a post with no counterpart
simply doesn't appear in the other language. The translation declares the
link with `translationKey: <id of the English post>`; the English post
declares nothing, because its key is its own id.

`src/lib/posts.ts` owns everything language-related — `byLang`,
`findTranslation`, `postHref`, `rssHref`. Always pass it a list that already
went through `selectPublished`: that's what keeps a post whose translation is
still a draft from linking to a page that doesn't exist.

The chrome (header, footer, home, 404) stays in English by design; only post
content and dates are localized. `@astrojs/sitemap`'s `i18n` option is
deliberately unused — it assumes both languages share a slug, which is not
the case here. hreflang comes from `Base.astro`, which knows the real pair.

See `docs/superpowers/specs/2026-09-08-bilingual-posts-design.md`.
