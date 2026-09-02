# Site pessoal eduardofaleiro.me — design

Data: 2026-09-01
Status: aprovado (design); pendente plano de implementação

## Objetivo

Um site pessoal estático que apresenta o Eduardo e hospeda seus posts.
Duas funções, nesta ordem: dar um endereço próprio com as redes sociais, e
publicar textos com atrito mínimo (escrever markdown, commitar, push).

Conteúdo do site inteiramente em **inglês**.

## Escopo

**Dentro:**

- Home: nome, bio curta, links das redes, últimos 5 posts.
- `/blog`: lista completa de posts.
- `/blog/<slug>`: post individual.
- Feed RSS, sitemap, robots.txt, 404.
- Deploy automático a partir do git.

**Fora, deliberadamente:**

- **Currículo / página `/cv`.** Decisão explícita do Eduardo: currículo dá
  manutenção constante e envelhece rápido. O design mantém `src/pages/` plano
  justamente para que adicionar `cv.astro` depois não exija reestruturação.
- Páginas de arquivo por tag (`/tags/<tag>`). As tags aparecem no post e na
  listagem; as páginas de arquivo só fazem sentido com volume de posts.
- Busca, comentários, analytics, newsletter, i18n, CMS.
- Imagem de Open Graph gerada por post (existe uma OG estática padrão).

## Stack

| Peça | Escolha | Motivo |
|---|---|---|
| Framework | Astro (última versão estável) | Content collections com validação de frontmatter, zero JS no cliente por padrão, RSS e sitemap oficiais |
| Conteúdo | Markdown no repositório | Sem serviço externo, sem custo, versionado em git |
| Estilo | CSS puro + custom properties | ~6 telas; o escopo de estilo nativo do Astro já cobre o caso sem adicionar Tailwind |
| Hospedagem | Vercel | Deploy por push, preview por branch, domínio customizado no free tier |
| Repositório | GitHub | A pasta ainda não é um repo; o setup inclui `git init` |

## Estrutura

```
src/
  content/blog/*.md        posts
  content.config.ts        schema do frontmatter
  data/social.ts           lista de redes (fonte única)
  layouts/Base.astro       shell HTML, <head>, header, footer
  layouts/Post.astro       layout do post
  components/SocialLinks.astro
  components/PostCard.astro
  pages/index.astro
  pages/blog/index.astro
  pages/blog/[...slug].astro
  pages/rss.xml.ts
  pages/404.astro
  styles/global.css
public/                    favicon, og-default.png, imagens dos posts
astro.config.mjs           site url + integração de sitemap
```

Cada unidade tem um propósito único: `Base.astro` é o único lugar que conhece
`<head>` e navegação; `social.ts` é o único lugar que conhece as redes;
`content.config.ts` é o único lugar que define o que é um post válido.

## Modelo de conteúdo

Um post é um arquivo `src/content/blog/<slug>.md`. O slug da URL vem do nome do
arquivo: `first-post.md` → `/blog/first-post`.

Frontmatter, validado no build:

| Campo | Tipo | Obrigatório | Nota |
|---|---|---|---|
| `title` | string | sim | |
| `description` | string | sim | usada na listagem, no `<meta description>` e no RSS |
| `pubDate` | date | sim | ordena a listagem e o feed |
| `updatedDate` | date | não | exibida quando presente |
| `tags` | string[] | não | default `[]`; exibidas no post, sem página de arquivo |
| `draft` | boolean | não | default `false` |
| `heroImage` | string | não | caminho em `public/` |

**Rascunhos:** `draft: true` aparece em `npm run dev` e nunca em produção — o
filtro é aplicado na build de produção, em todas as listagens e no RSS.

**Validação como rede de segurança:** frontmatter inválido quebra o build com
mensagem explícita, em vez de publicar uma página malformada. Esse é o principal
mecanismo de correção do projeto.

## Páginas

- **`/`** — nome, bio de 2-3 linhas, `SocialLinks`, e os 5 posts mais recentes
  com link para `/blog`.
- **`/blog`** — todos os posts publicados, mais recentes primeiro.
- **`/blog/<slug>`** — título, data, tags, conteúdo renderizado. Largura de
  leitura ~65ch.
- **`/rss.xml`** — feed dos posts publicados.
- **`/404`** — mensagem curta e link para a home.

## Estilo

- Tokens (cor, espaçamento, escala tipográfica) como custom properties em
  `global.css`; o resto em estilos escopados por componente.
- Coluna única, responsiva, largura de leitura ~65ch.
- Tema claro e escuro via `prefers-color-scheme`. Sem seletor manual.
- System font stack no início; trocar por webfont depois é uma alteração local.
- Acessibilidade: HTML semântico, foco visível no teclado, contraste conferido.

## SEO e compartilhamento

- `title` e `description` por página; URL canônica.
- Open Graph e Twitter card em todas as páginas, com `public/og-default.png`
  como imagem padrão.
- Sitemap via `@astrojs/sitemap`; `robots.txt` liberando tudo e apontando o
  sitemap.
- `site` configurado em `astro.config.mjs` como `https://eduardofaleiro.me`,
  necessário para canonical, sitemap e RSS gerarem URLs absolutas.

## Verificação

O build é o mecanismo de verificação primário. Não há test runner nesta fase:
não existe lógica de unidade em markdown → HTML, e um runner sem nada para
testar é manutenção sem retorno.

- `astro check` — tipos e templates.
- `astro build` — validação de schema de todo o conteúdo, imports quebrados.
- Ambos rodam no CI a cada push (GitHub Actions) e localmente antes do commit.
- Preview da Vercel por branch: conferência visual antes do merge.

**Quando isso muda:** na primeira lógica real (tempo de leitura, formatação de
data, filtro de posts além do trivial), ela nasce com teste unitário em vitest,
escrito antes da implementação.

## Erros

Não há runtime em produção — o site é HTML estático servido por CDN. O único
modo de falha real é build quebrado, que ocorre antes do deploy: a Vercel
mantém a versão anterior no ar e reporta a falha. A única página de erro
necessária é a 404.

## Deploy

1. `git init` + primeiro commit; repositório no GitHub.
2. Projeto na Vercel conectado ao repo. Push na `main` publica; branches geram
   preview.
3. Domínio `eduardofaleiro.me` apontado para a Vercel — **passo do Eduardo**,
   por envolver contas dele. A implementação entrega o projeto pronto até esse
   ponto, com os registros DNS exatos documentados no README.

## Conteúdo que o Eduardo precisa fornecer

Até chegarem, a implementação usa placeholders explicitamente marcados no
código; nada disso bloqueia o desenvolvimento.

- Texto da bio (2-3 linhas, em inglês).
- URL do GitHub e do LinkedIn.
- A terceira rede: Instagram, YouTube ou e-mail — qual delas, e o link.
- Opcional: favicon e imagem OG. Sem eles, entram versões placeholder.
