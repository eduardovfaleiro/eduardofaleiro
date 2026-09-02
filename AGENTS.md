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
