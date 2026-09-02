# Site pessoal eduardofaleiro.me — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um site pessoal estático em Astro com posts em markdown e links de redes sociais, publicado na Vercel a partir de push no git.

**Architecture:** Site 100% estático gerado por Astro. Posts vivem como arquivos markdown em `src/content/blog/`, validados por schema Zod no build. Uma função pura (`selectPublished`) centraliza filtro de rascunhos e ordenação, consumida por todas as listagens e pelo RSS. Layout base único conhece `<head>` e navegação; um módulo de dados único conhece as redes sociais.

**Tech Stack:** Astro (última estável), TypeScript strict, `@astrojs/sitemap`, `@astrojs/rss`, `@astrojs/check`, vitest (só para `src/lib/`), CSS puro com custom properties, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-01-personal-site-design.md`

## Global Constraints

- Todo o **conteúdo visível do site é em inglês** (textos de interface, bio, posts, `lang="en"`). Este plano e os commits são em português.
- Node 22 (ambiente atual: v22.23.1, npm 10.9.8).
- TypeScript em modo `strict`.
- `site` em `astro.config.mjs` é exatamente `https://eduardofaleiro.me`.
- Sem Tailwind, sem framework de UI, sem JS no cliente. CSS puro com custom properties.
- Zero dependências além das listadas em Tech Stack.
- Rascunhos (`draft: true`) nunca aparecem em build de produção nem no RSS.
- Cada task termina com `npm run check && npm run build` verdes e um commit.
- **Desvio consciente do spec:** o spec dizia "sem test runner nesta fase". A Task 3 introduz vitest para uma única unidade — `selectPublished` —, porque é lógica pura cujo modo de falha (rascunho vazando para produção) é silencioso e não é pego pelo build. O spec já previa esse gatilho ("quando surgir lógica de verdade... filtro de posts"). Nenhum outro arquivo ganha teste unitário.

## Mapa de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `astro.config.mjs` | `site`, integração de sitemap | 1, 9 |
| `.github/workflows/ci.yml` | check + build (+ testes) a cada push | 1, 3 |
| `src/content.config.ts` | única definição do que é um post válido | 2 |
| `src/content/blog/*.md` | os posts | 2 |
| `src/lib/posts.ts` | filtro de rascunho + ordenação (função pura) | 3 |
| `src/lib/posts.test.ts` | testes da unidade acima | 3 |
| `src/styles/global.css` | tokens, tipografia, tema claro/escuro, `.prose` | 4 |
| `src/layouts/Base.astro` | único lugar que conhece `<head>`, header, footer | 4, 9 |
| `src/pages/404.astro` | página de erro | 4 |
| `src/data/social.ts` | única lista de redes sociais | 5 |
| `src/components/SocialLinks.astro` | renderiza a lista de redes | 5 |
| `src/components/PostCard.astro` | um item de listagem de post | 6 |
| `src/pages/blog/index.astro` | listagem completa | 6 |
| `src/layouts/Post.astro` | moldura de um post | 7 |
| `src/pages/blog/[...slug].astro` | rota de cada post | 7 |
| `src/pages/index.astro` | home: bio + redes + 5 últimos posts | 8 |
| `src/pages/rss.xml.ts` | feed | 9 |
| `public/robots.txt`, `public/og-default.png`, `public/favicon.svg` | assets estáticos | 9 |
| `README.md` | como escrever um post, como fazer deploy, registros de DNS | 10 |

---

### Task 1: Scaffold, configuração e CI

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `.gitignore`, `src/pages/index.astro` (temporário, vem do template)
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nada
- Produces: scripts npm `dev`, `build`, `preview`, `check`; projeto Astro que compila

- [ ] **Step 1: Gerar o projeto num diretório limpo e copiar para cá**

O diretório do projeto já contém `docs/` e `.git/`, então não scaffoldamos direto nele.

```bash
cd /home/bridge/Documents/personal-projects/eduardofaleiro.me
SCRATCH="$(mktemp -d)"
npm create astro@latest "$SCRATCH/site" -- \
  --template minimal --install --no-git --typescript strict --skip-houston
cp -R "$SCRATCH/site/." .
rm -rf "$SCRATCH"
ls -A
```

Esperado: `package.json`, `astro.config.mjs`, `tsconfig.json`, `src/`, `public/`, `node_modules/`, `.gitignore` presentes, e `docs/` + `.git/` intactos.

- [ ] **Step 2: Instalar as dependências restantes**

```bash
npm install @astrojs/rss
npm install -D @astrojs/check typescript
npx astro add sitemap --yes
```

- [ ] **Step 3: Configurar `site` e sitemap**

Substitua `astro.config.mjs` inteiro por:

```js
// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://eduardofaleiro.me',
  integrations: [sitemap()],
});
```

- [ ] **Step 4: Adicionar o script `check`**

Em `package.json`, dentro de `"scripts"`, acrescente:

```json
"check": "astro check"
```

- [ ] **Step 5: Rodar a verificação e confirmar que passa**

```bash
npm run check && npm run build
```

Esperado: `astro check` termina com `0 errors`; `astro build` termina com `Complete!` e cria `dist/`.

- [ ] **Step 6: Criar o workflow de CI**

Crie `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run build
```

- [ ] **Step 7: Garantir que `dist/` está ignorada**

```bash
grep -q '^dist' .gitignore || echo 'dist/' >> .gitignore
cat .gitignore
```

Esperado: o arquivo contém `dist/` e `node_modules/`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold do projeto Astro com sitemap, check e CI"
```

---

### Task 2: Coleção de conteúdo e schema dos posts

**Files:**
- Create: `src/content.config.ts`
- Create: `src/content/blog/hello-world.md`
- Create: `src/content/blog/draft-example.md`

**Interfaces:**
- Consumes: projeto Astro da Task 1
- Produces: coleção `blog`, consultável por `getCollection('blog')`. Cada entrada tem `id` (slug vindo do nome do arquivo) e `data` com: `title: string`, `description: string`, `pubDate: Date`, `updatedDate?: Date`, `tags: string[]`, `draft: boolean`, `heroImage?: string`.

- [ ] **Step 1: Definir o schema da coleção**

Crie `src/content.config.ts`:

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    heroImage: z.string().optional(),
  }),
});

export const collections = { blog };
```

- [ ] **Step 2: Escrever um post inválido de propósito, para ver o schema falhar**

Isto é o teste do schema. Crie `src/content/blog/hello-world.md` **sem** o campo `description`:

```markdown
---
title: "Hello, world"
pubDate: 2026-09-01
---

First post.
```

- [ ] **Step 3: Rodar o build e confirmar que ele quebra**

```bash
npm run build
```

Esperado: FALHA, com mensagem contendo `hello-world` e `description: Required` (a coleção rejeita o post malformado em vez de publicá-lo).

- [ ] **Step 4: Corrigir o post para a versão válida**

Substitua `src/content/blog/hello-world.md` inteiro por:

```markdown
---
title: "Hello, world"
description: "Why I built this site and what I plan to write about here."
pubDate: 2026-09-01
tags: ["meta"]
---

This is the first post on my site. I set it up to have a place of my own for
notes on the things I build.

More soon.
```

- [ ] **Step 5: Criar um rascunho, que servirá de verificação nas tasks seguintes**

Crie `src/content/blog/draft-example.md`:

```markdown
---
title: "Draft example"
description: "This post must never appear in a production build."
pubDate: 2026-09-02
draft: true
---

If you can read this on the live site, draft filtering is broken.
```

- [ ] **Step 6: Rodar a verificação e confirmar que passa**

```bash
npm run check && npm run build
```

Esperado: ambos verdes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: coleção de posts com schema validado no build"
```

---

### Task 3: Filtro de rascunhos e ordenação (`selectPublished`)

**Files:**
- Create: `src/lib/posts.ts`
- Create: `src/lib/posts.test.ts`
- Modify: `package.json` (script `test`), `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: coleção `blog` da Task 2 (só o formato de `data`, não o módulo)
- Produces: `selectPublished<T extends PostLike>(posts: T[], includeDrafts?: boolean): T[]` — retorna um **novo** array, sem rascunhos (a menos que `includeDrafts` seja `true`), ordenado por `pubDate` decrescente. `PostLike = { data: { pubDate: Date; draft?: boolean } }`. Toda listagem e o RSS passam por ela.

- [ ] **Step 1: Instalar o vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Adicionar o script de teste**

Em `package.json`, dentro de `"scripts"`, acrescente:

```json
"test": "vitest run"
```

- [ ] **Step 3: Escrever os testes que falham**

Crie `src/lib/posts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { selectPublished } from './posts';

const post = (id: string, pubDate: string, draft = false) => ({
  id,
  data: { pubDate: new Date(pubDate), draft },
});

describe('selectPublished', () => {
  it('ordena do mais recente para o mais antigo', () => {
    const input = [
      post('older', '2026-01-01'),
      post('newer', '2026-06-01'),
      post('middle', '2026-03-01'),
    ];

    expect(selectPublished(input).map((p) => p.id)).toEqual([
      'newer',
      'middle',
      'older',
    ]);
  });

  it('remove rascunhos por padrão', () => {
    const input = [post('published', '2026-01-01'), post('hidden', '2026-06-01', true)];

    expect(selectPublished(input).map((p) => p.id)).toEqual(['published']);
  });

  it('mantém rascunhos quando includeDrafts é true', () => {
    const input = [post('published', '2026-01-01'), post('hidden', '2026-06-01', true)];

    expect(selectPublished(input, true).map((p) => p.id)).toEqual([
      'hidden',
      'published',
    ]);
  });

  it('trata draft ausente como publicado', () => {
    const input = [{ id: 'no-flag', data: { pubDate: new Date('2026-01-01') } }];

    expect(selectPublished(input).map((p) => p.id)).toEqual(['no-flag']);
  });

  it('não muta o array recebido', () => {
    const input = [post('a', '2026-01-01'), post('b', '2026-06-01')];

    selectPublished(input);

    expect(input.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 4: Rodar os testes e confirmar que falham**

```bash
npm test
```

Esperado: FALHA com erro de resolução — `Failed to resolve import "./posts"`.

- [ ] **Step 5: Implementar a função**

Crie `src/lib/posts.ts`:

```ts
export type PostLike = {
  data: {
    pubDate: Date;
    draft?: boolean;
  };
};

/**
 * Ordena posts do mais recente para o mais antigo e, por padrão, descarta
 * rascunhos. Passe `includeDrafts` como `import.meta.env.DEV` para vê-los
 * apenas durante o desenvolvimento.
 */
export function selectPublished<T extends PostLike>(
  posts: T[],
  includeDrafts = false,
): T[] {
  return posts
    .filter((post) => includeDrafts || !post.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}
```

- [ ] **Step 6: Rodar os testes e confirmar que passam**

```bash
npm test
```

Esperado: `5 passed`.

- [ ] **Step 7: Acrescentar os testes ao CI**

Em `.github/workflows/ci.yml`, insira um passo entre `npm run check` e `npm run build`:

```yaml
      - run: npm test
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: selectPublished filtra rascunhos e ordena posts por data"
```

---

### Task 4: Layout base, estilos globais e página 404

**Files:**
- Create: `src/styles/global.css`
- Create: `src/layouts/Base.astro`
- Create: `src/pages/404.astro`
- Modify: `src/pages/index.astro` (o placeholder do template passa a usar o layout)

**Interfaces:**
- Consumes: nada das tasks anteriores
- Produces: `Base.astro` com props `{ title: string; description: string }` e um `<slot />` dentro de `<main id="main">`. Classes disponíveis globalmente: `.container` (coluna centralizada), `.prose` (largura de leitura ~65ch para texto corrido). Tokens CSS: `--bg`, `--fg`, `--fg-muted`, `--accent`, `--border`, `--space`, `--radius`.

- [ ] **Step 1: Escrever os estilos globais**

Crie `src/styles/global.css`:

```css
:root {
  --bg: #fbfbfa;
  --fg: #1b1b1a;
  --fg-muted: #5c5c58;
  --accent: #1a4fd6;
  --border: #e2e2dd;
  --space: 1rem;
  --radius: 6px;
  --font-body: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121211;
    --fg: #ececeb;
    --fg-muted: #a3a39d;
    --accent: #8fb0ff;
    --border: #2c2c2a;
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body);
  font-size: 1.05rem;
  line-height: 1.65;
  -webkit-text-size-adjust: 100%;
}

a {
  color: var(--accent);
}

a:focus-visible,
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

img {
  max-width: 100%;
  height: auto;
}

code,
pre {
  font-family: var(--font-mono);
  font-size: 0.9em;
}

pre {
  overflow-x: auto;
  padding: var(--space);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.container {
  width: min(100% - 2 * var(--space), 48rem);
  margin-inline: auto;
}

.prose {
  max-width: 65ch;
}

.prose h2,
.prose h3 {
  line-height: 1.25;
  margin-top: 2em;
}

.prose blockquote {
  margin-inline: 0;
  padding-left: var(--space);
  border-left: 3px solid var(--border);
  color: var(--fg-muted);
}

.skip-link {
  position: absolute;
  left: -9999px;
}

.skip-link:focus {
  left: var(--space);
  top: var(--space);
  padding: 0.5rem 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  z-index: 10;
}

.site-header,
.site-footer {
  border-color: var(--border);
  border-style: solid;
}

.site-header {
  border-width: 0 0 1px;
  padding-block: var(--space);
  margin-bottom: calc(2 * var(--space));
}

.site-footer {
  border-width: 1px 0 0;
  padding-block: var(--space);
  margin-top: calc(3 * var(--space));
  color: var(--fg-muted);
  font-size: 0.9rem;
}

.site-header > .container,
.site-footer > .container {
  display: flex;
  gap: var(--space);
  align-items: center;
  justify-content: space-between;
}

.site-name {
  font-weight: 600;
  color: var(--fg);
  text-decoration: none;
}
```

- [ ] **Step 2: Escrever o layout base**

Crie `src/layouts/Base.astro`:

```astro
---
import '../styles/global.css';

interface Props {
  title: string;
  description: string;
}

const { title, description } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="sitemap" href="/sitemap-index.xml" />
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>

    <header class="site-header">
      <div class="container">
        <a class="site-name" href="/">Eduardo Faleiro</a>
        <nav aria-label="Main">
          <a href="/blog">Blog</a>
        </nav>
      </div>
    </header>

    <main id="main" class="container">
      <slot />
    </main>

    <footer class="site-footer">
      <div class="container">
        <p>&copy; {new Date().getFullYear()} Eduardo Faleiro</p>
      </div>
    </footer>
  </body>
</html>
```

- [ ] **Step 3: Escrever a página 404**

Crie `src/pages/404.astro`:

```astro
---
import Base from '../layouts/Base.astro';
---

<Base title="Page not found — Eduardo Faleiro" description="This page does not exist.">
  <div class="prose">
    <h1>Page not found</h1>
    <p>That page does not exist. Try the <a href="/">home page</a> or the <a href="/blog">blog</a>.</p>
  </div>
</Base>
```

- [ ] **Step 4: Fazer a home do template usar o layout**

Substitua `src/pages/index.astro` inteiro por:

```astro
---
import Base from '../layouts/Base.astro';
---

<Base title="Eduardo Faleiro" description="Personal site of Eduardo Faleiro.">
  <div class="prose">
    <h1>Eduardo Faleiro</h1>
  </div>
</Base>
```

(A home ganha seu conteúdo real na Task 8.)

- [ ] **Step 5: Verificar que o layout chega ao HTML gerado**

```bash
npm run check && npm run build
grep -q 'lang="en"' dist/index.html && echo "OK lang"
grep -q 'skip-link' dist/index.html && echo "OK skip link"
grep -q '<title>Eduardo Faleiro</title>' dist/index.html && echo "OK title"
test -f dist/404.html && echo "OK 404"
```

Esperado: `check` e `build` verdes, e as quatro linhas `OK ...` impressas.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: layout base, tokens de estilo, tema escuro e pagina 404"
```

---

### Task 5: Redes sociais

**Files:**
- Create: `src/data/social.ts`
- Create: `src/components/SocialLinks.astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `Base.astro` da Task 4
- Produces: `social: SocialLink[]` exportado de `src/data/social.ts`, onde `SocialLink = { name: string; url: string }`; componente `SocialLinks.astro` sem props, que renderiza `<ul>` com um link por rede.

**Nota sobre os dados:** os URLs reais ainda não foram fornecidos pelo Eduardo. Use exatamente os valores abaixo, com o comentário `TODO` preservado — a Task 10 lembra de trocá-los. A terceira rede (Instagram, YouTube ou e-mail) ainda não foi escolhida; entra como Instagram por ora e é uma linha para trocar.

- [ ] **Step 1: Criar a lista de redes**

Crie `src/data/social.ts`:

```ts
export type SocialLink = {
  name: string;
  url: string;
};

// TODO(eduardo): substituir pelos perfis reais antes de apontar o domínio.
// A terceira entrada é um provisório — trocar por YouTube ou mailto: se preferir.
export const social: SocialLink[] = [
  { name: 'GitHub', url: 'https://github.com/CHANGE-ME' },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/in/CHANGE-ME' },
  { name: 'Instagram', url: 'https://www.instagram.com/CHANGE-ME' },
];
```

- [ ] **Step 2: Criar o componente**

Crie `src/components/SocialLinks.astro`:

```astro
---
import { social } from '../data/social';
---

<ul class="social">
  {
    social.map((link) => (
      <li>
        <a href={link.url} rel="me noopener" target="_blank">
          {link.name}
        </a>
      </li>
    ))
  }
</ul>

<style>
  .social {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space);
    padding: 0;
    margin: 0;
    list-style: none;
  }
</style>
```

- [ ] **Step 3: Usar o componente na home**

Substitua `src/pages/index.astro` inteiro por:

```astro
---
import Base from '../layouts/Base.astro';
import SocialLinks from '../components/SocialLinks.astro';
---

<Base title="Eduardo Faleiro" description="Personal site of Eduardo Faleiro.">
  <div class="prose">
    <h1>Eduardo Faleiro</h1>
    <SocialLinks />
  </div>
</Base>
```

- [ ] **Step 4: Verificar que as três redes aparecem no HTML**

```bash
npm run check && npm run build
grep -c 'rel="me noopener"' dist/index.html
```

Esperado: `check` e `build` verdes, e o `grep -c` imprime `3`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: lista de redes sociais como fonte unica e componente de links"
```

---

### Task 6: Listagem de posts em `/blog`

**Files:**
- Create: `src/components/PostCard.astro`
- Create: `src/pages/blog/index.astro`

**Interfaces:**
- Consumes: coleção `blog` (Task 2), `selectPublished` (Task 3), `Base.astro` (Task 4)
- Produces: `PostCard.astro` com props `{ post: CollectionEntry<'blog'> }`, que linka para `/blog/<post.id>/`. Rota `/blog` listando os posts publicados.

- [ ] **Step 1: Criar o componente de item de listagem**

Crie `src/components/PostCard.astro`:

```astro
---
import type { CollectionEntry } from 'astro:content';

interface Props {
  post: CollectionEntry<'blog'>;
}

const { post } = Astro.props;

const formattedDate = post.data.pubDate.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});
---

<article class="card">
  <h2>
    <a href={`/blog/${post.id}/`}>{post.data.title}</a>
    {post.data.draft && <span class="draft">draft</span>}
  </h2>
  <p class="meta">
    <time datetime={post.data.pubDate.toISOString()}>{formattedDate}</time>
  </p>
  <p>{post.data.description}</p>
</article>

<style>
  .card {
    padding-block: var(--space);
    border-bottom: 1px solid var(--border);
  }

  .card h2 {
    margin-block: 0 0.25rem;
    font-size: 1.25rem;
    line-height: 1.3;
  }

  .card h2 a {
    text-decoration: none;
  }

  .card h2 a:hover {
    text-decoration: underline;
  }

  .card p {
    margin-block: 0.25rem;
  }

  .meta {
    color: var(--fg-muted);
    font-size: 0.9rem;
  }

  .draft {
    margin-left: 0.5rem;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--fg-muted);
    font-size: 0.7rem;
    text-transform: uppercase;
    vertical-align: middle;
  }
</style>
```

- [ ] **Step 2: Criar a página de listagem**

Crie `src/pages/blog/index.astro`:

```astro
---
import { getCollection } from 'astro:content';
import Base from '../../layouts/Base.astro';
import PostCard from '../../components/PostCard.astro';
import { selectPublished } from '../../lib/posts';

const posts = selectPublished(await getCollection('blog'), import.meta.env.DEV);
---

<Base title="Blog — Eduardo Faleiro" description="Posts by Eduardo Faleiro.">
  <h1>Blog</h1>
  {posts.length === 0 && <p>No posts yet.</p>}
  {posts.map((post) => <PostCard post={post} />)}
</Base>
```

- [ ] **Step 3: Verificar que a listagem sai e que o rascunho não vaza**

```bash
npm run check && npm run build
grep -q 'Hello, world' dist/blog/index.html && echo "OK post publicado"
grep -q 'Draft example' dist/blog/index.html && echo "FALHA: rascunho vazou" || echo "OK rascunho oculto"
```

Esperado: `check` e `build` verdes, `OK post publicado` e `OK rascunho oculto`.

- [ ] **Step 4: Verificar que o rascunho aparece em desenvolvimento**

```bash
npm run dev > /tmp/astro-dev.log 2>&1 &
DEV_PID=$!
sleep 5
curl -s http://localhost:4321/blog | grep -q 'Draft example' && echo "OK rascunho visivel no dev"
kill $DEV_PID
```

Esperado: `OK rascunho visivel no dev`. (Se a porta 4321 estiver ocupada, use a porta que o `astro dev` imprimir.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: listagem de posts em /blog"
```

---

### Task 7: Página de cada post

**Files:**
- Create: `src/layouts/Post.astro`
- Create: `src/pages/blog/[...slug].astro`

**Interfaces:**
- Consumes: coleção `blog` (Task 2), `selectPublished` (Task 3), `Base.astro` (Task 4)
- Produces: rota `/blog/<slug>/` para cada post. `Post.astro` recebe `{ post: CollectionEntry<'blog'> }` e renderiza o conteúdo via `<slot />`.

- [ ] **Step 1: Criar o layout do post**

Crie `src/layouts/Post.astro`:

```astro
---
import type { CollectionEntry } from 'astro:content';
import Base from './Base.astro';

interface Props {
  post: CollectionEntry<'blog'>;
}

const { post } = Astro.props;

const format = (date: Date) =>
  date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
---

<Base title={`${post.data.title} — Eduardo Faleiro`} description={post.data.description}>
  <article class="prose">
    <h1>{post.data.title}</h1>

    <p class="meta">
      <time datetime={post.data.pubDate.toISOString()}>{format(post.data.pubDate)}</time>
      {post.data.updatedDate && <span> · updated {format(post.data.updatedDate)}</span>}
      {post.data.tags.length > 0 && <span> · {post.data.tags.join(', ')}</span>}
    </p>

    {post.data.heroImage && <img src={post.data.heroImage} alt="" />}

    <slot />
  </article>
</Base>

<style>
  .meta {
    margin-top: -0.5rem;
    color: var(--fg-muted);
    font-size: 0.9rem;
  }
</style>
```

- [ ] **Step 2: Criar a rota dinâmica**

Crie `src/pages/blog/[...slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import Post from '../../layouts/Post.astro';
import { selectPublished } from '../../lib/posts';

export async function getStaticPaths() {
  const posts = selectPublished(await getCollection('blog'), import.meta.env.DEV);

  return posts.map((post) => ({
    params: { slug: post.id },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content } = await render(post);
---

<Post post={post}>
  <Content />
</Post>
```

- [ ] **Step 3: Verificar que a página do post existe e que o rascunho não gera página**

```bash
npm run check && npm run build
test -f dist/blog/hello-world/index.html && echo "OK pagina do post"
grep -q 'First post' dist/blog/hello-world/index.html || grep -q 'first post' dist/blog/hello-world/index.html && echo "OK conteudo renderizado"
test -e dist/blog/draft-example && echo "FALHA: rascunho gerou pagina" || echo "OK rascunho sem pagina"
```

Esperado: `check` e `build` verdes, `OK pagina do post`, `OK conteudo renderizado`, `OK rascunho sem pagina`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: pagina individual de post com layout de leitura"
```

---

### Task 8: Home

**Files:**
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes: `SocialLinks` (Task 5), `PostCard` (Task 6), `selectPublished` (Task 3), `Base.astro` (Task 4)
- Produces: home com bio, redes e os 5 posts mais recentes

**Nota sobre o texto:** a bio real ainda não foi fornecida. Use exatamente o texto abaixo, com o comentário `TODO` preservado; a Task 10 lembra de trocá-lo.

- [ ] **Step 1: Escrever a home**

Substitua `src/pages/index.astro` inteiro por:

```astro
---
import { getCollection } from 'astro:content';
import Base from '../layouts/Base.astro';
import PostCard from '../components/PostCard.astro';
import SocialLinks from '../components/SocialLinks.astro';
import { selectPublished } from '../lib/posts';

const posts = selectPublished(await getCollection('blog'), import.meta.env.DEV);
const recent = posts.slice(0, 5);
---

<Base
  title="Eduardo Faleiro"
  description="Personal site of Eduardo Faleiro — software engineer. Notes on the things I build."
>
  <section class="intro prose">
    <h1>Eduardo Faleiro</h1>
    {/* TODO(eduardo): substituir por uma bio real de 2-3 linhas, em inglês. */}
    <p>
      Software engineer. I write here about the things I build and what I learn
      along the way.
    </p>
    <SocialLinks />
  </section>

  <section class="recent">
    <h2>Recent posts</h2>
    {recent.length === 0 && <p>No posts yet.</p>}
    {recent.map((post) => <PostCard post={post} />)}
    {posts.length > recent.length && <p><a href="/blog">All posts</a></p>}
  </section>
</Base>

<style>
  .intro {
    margin-bottom: calc(3 * var(--space));
  }

  .recent h2 {
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-muted);
  }
</style>
```

- [ ] **Step 2: Verificar**

```bash
npm run check && npm run build
grep -q 'Recent posts' dist/index.html && echo "OK secao de posts"
grep -q 'Hello, world' dist/index.html && echo "OK post na home"
grep -q 'Draft example' dist/index.html && echo "FALHA: rascunho na home" || echo "OK rascunho fora da home"
```

Esperado: `check` e `build` verdes e as três linhas `OK ...`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: home com bio, redes e posts recentes"
```

---

### Task 9: RSS, robots, favicon e metadados de compartilhamento

**Files:**
- Create: `src/pages/rss.xml.ts`
- Create: `public/robots.txt`, `public/favicon.svg`, `public/og-default.png`
- Modify: `src/layouts/Base.astro`

**Interfaces:**
- Consumes: coleção `blog` (Task 2), `selectPublished` (Task 3)
- Produces: `/rss.xml`; `Base.astro` ganha a prop opcional `ogImage?: string` (default `/og-default.png`) e passa a emitir canonical, Open Graph e Twitter card. Assinatura final: `{ title: string; description: string; ogImage?: string }`.

- [ ] **Step 1: Criar o feed RSS**

Crie `src/pages/rss.xml.ts`:

```ts
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { selectPublished } from '../lib/posts';

export async function GET(context: APIContext) {
  // O feed nunca inclui rascunhos, nem em desenvolvimento.
  const posts = selectPublished(await getCollection('blog'));

  return rss({
    title: 'Eduardo Faleiro',
    description: 'Notes on the things I build.',
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/blog/${post.id}/`,
    })),
    customData: '<language>en-us</language>',
  });
}
```

- [ ] **Step 2: Criar o robots.txt**

Crie `public/robots.txt`:

```
User-agent: *
Allow: /

Sitemap: https://eduardofaleiro.me/sitemap-index.xml
```

- [ ] **Step 3: Criar o favicon**

Substitua `public/favicon.svg` (o template minimal cria um) por:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#1a4fd6"/>
  <text x="32" y="44" font-family="system-ui, sans-serif" font-size="34"
        font-weight="600" fill="#ffffff" text-anchor="middle">EF</text>
</svg>
```

- [ ] **Step 4: Gerar a imagem OG padrão**

O ambiente tem python3 com Pillow 10.2. Rode:

```bash
python3 - <<'PY'
from PIL import Image, ImageDraw
img = Image.new("RGB", (1200, 630), "#121211")
d = ImageDraw.Draw(img)
d.rectangle([0, 596, 1200, 630], fill="#1a4fd6")
d.text((80, 250), "Eduardo Faleiro", fill="#ececeb")
d.text((80, 300), "eduardofaleiro.me", fill="#a3a39d")
img.save("public/og-default.png")
PY
python3 -c "from PIL import Image; print(Image.open('public/og-default.png').size)"
```

Esperado: `(1200, 630)`.

(Imagem provisória, com a fonte bitmap padrão do Pillow. A Task 10 registra a troca por uma versão desenhada como pendência do Eduardo.)

- [ ] **Step 5: Adicionar os metadados ao layout base**

Substitua o bloco de frontmatter e o `<head>` de `src/layouts/Base.astro` por:

```astro
---
import '../styles/global.css';

interface Props {
  title: string;
  description: string;
  ogImage?: string;
}

const { title, description, ogImage = '/og-default.png' } = Astro.props;

const canonical = new URL(Astro.url.pathname, Astro.site);
const ogImageUrl = new URL(ogImage, Astro.site);
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="sitemap" href="/sitemap-index.xml" />
    <link
      rel="alternate"
      type="application/rss+xml"
      title="Eduardo Faleiro"
      href="/rss.xml"
    />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Eduardo Faleiro" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonical} />
    <meta property="og:image" content={ogImageUrl} />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={ogImageUrl} />
  </head>
```

O restante do arquivo (de `<body>` até `</html>`) fica inalterado.

- [ ] **Step 6: Verificar feed, sitemap e metadados**

```bash
npm run check && npm run build
grep -q '<item>' dist/rss.xml && echo "OK feed tem item"
grep -q 'Draft example' dist/rss.xml && echo "FALHA: rascunho no feed" || echo "OK rascunho fora do feed"
grep -q 'https://eduardofaleiro.me/blog/hello-world/' dist/rss.xml && echo "OK link absoluto"
test -f dist/sitemap-index.xml && echo "OK sitemap"
grep -q 'og:image' dist/index.html && echo "OK open graph"
grep -q 'rel="canonical"' dist/blog/hello-world/index.html && echo "OK canonical"
```

Esperado: `check` e `build` verdes e as seis linhas `OK ...`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: RSS, sitemap, robots, favicon e metadados de compartilhamento"
```

---

### Task 10: Deploy na Vercel e documentação

**Files:**
- Create: `README.md`
- Modify: nenhum arquivo de código

**Interfaces:**
- Consumes: o site completo das Tasks 1-9
- Produces: repositório publicado, projeto na Vercel, README com o fluxo de escrita e os registros de DNS

- [ ] **Step 1: Escrever o README**

Crie `README.md`:

```markdown
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

```markdown
---
title: "Post title"
description: "One or two sentences. Used in listings, meta tags and the RSS feed."
pubDate: 2026-09-01
tags: ["optional", "tags"]
draft: false
---
```

3. Write the body in Markdown.
4. Commit and push to `main`. Vercel builds and publishes automatically.

`draft: true` posts show up in `npm run dev` and are excluded from production
builds and from the RSS feed.

Invalid frontmatter fails the build with an explicit error instead of
publishing a broken page.

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
```

- [ ] **Step 2: Publicar o repositório no GitHub**

```bash
gh repo create eduardofaleiro.me --private --source=. --remote=origin --push
```

Se o `gh` não estiver autenticado, rode `gh auth login` antes (é um comando interativo — o Eduardo executa).

- [ ] **Step 3: Conferir que o CI passou**

```bash
gh run list --limit 1
```

Esperado: o workflow `CI` com conclusão `success`.

- [ ] **Step 4: Criar o projeto na Vercel**

Passo do Eduardo, no navegador: em vercel.com, **Add New → Project**, importar o repositório `eduardofaleiro.me`. A Vercel detecta Astro sozinha — framework preset `Astro`, build `npm run build`, output `dist`. Confirmar e fazer o primeiro deploy.

- [ ] **Step 5: Apontar o domínio**

Passo do Eduardo: em **Project → Settings → Domains**, adicionar `eduardofaleiro.me`, e criar no registrador os registros que a Vercel exibir (conferindo contra a tabela do README).

- [ ] **Step 6: Trocar os placeholders por conteúdo real**

Pendências que dependem de dados do Eduardo:

- `src/data/social.ts` — URLs reais do GitHub e do LinkedIn, e decidir a terceira rede (Instagram, YouTube ou `mailto:`).
- `src/pages/index.astro` — a bio real, 2-3 linhas em inglês.
- `public/og-default.png` — opcionalmente trocar a imagem provisória por uma desenhada.

```bash
grep -rn "TODO(eduardo)\|CHANGE-ME" src/
```

Esperado ao final: nenhuma ocorrência.

- [ ] **Step 7: Commit final**

```bash
npm run check && npm test && npm run build
git add -A
git commit -m "docs: README com fluxo de publicacao e registros de DNS"
git push
```

---

## Estado final esperado

- `/`, `/blog`, `/blog/hello-world/`, `/rss.xml`, `/sitemap-index.xml`,
  `/robots.txt` e a 404 respondendo em produção.
- `draft: true` invisível em produção e no feed, visível em `npm run dev`.
- Frontmatter inválido quebrando o build antes do deploy.
- `npm run check`, `npm test` e `npm run build` verdes no CI a cada push.
