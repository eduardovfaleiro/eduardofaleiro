# Posts em inglês e português — design

Data: 2026-09-08
Status: aprovado (design); implementação direta, sem plano separado

Supersede a linha "i18n" da seção **Fora, deliberadamente** de
`2026-09-01-personal-site-design.md`, que excluía internacionalização do
escopo inicial.

## Objetivo

Permitir que um post exista em inglês, em português, ou nos dois, com URLs
próprias por idioma e um seletor no cabeçalho que leva de uma versão à outra.

## Decisões

| Questão | Decisão | Motivo |
|---|---|---|
| Formato das URLs | Inglês na raiz, `/pt/` para português | Não quebra as URLs já indexadas dos posts existentes |
| Cobertura | Traduzir é opcional, sem fallback | Um leitor de `/pt/` nunca cai em conteúdo em inglês sem aviso |
| Chrome (header, footer, home, 404) | Continua em inglês | Decisão do Eduardo: escopo menor agora |
| Seletor de idioma | No cabeçalho; some onde não há par | Sem link morto, sem idioma esmaecido que nunca clica |
| Datas | Formatadas no idioma do post | A data fica dentro do artigo, não no chrome |
| RSS | Dois feeds independentes | Quem assina `/rss.xml` hoje não passa a receber português |

### Escopo do português

Existe: `/pt/blog/` (índice), `/pt/blog/<slug>/` (posts), `/pt/rss.xml`.

Não existe: `/pt/` (home) e `/pt/404`. Como o chrome fica em inglês, uma home
em `/pt/` seria byte a byte igual a `/` — conteúdo duplicado para o Google sem
nenhum ganho para o leitor.

**Consequência aceita:** a home lista apenas posts em inglês, e o índice
`/pt/blog/` é alcançável pelo seletor a partir de `/blog/` (e pelo sitemap).

## Modelo de conteúdo

Arquivos planos em `src/content/blog/`, um por idioma, com o idioma no
frontmatter. Dois campos novos no schema:

```ts
lang: z.enum(['en', 'pt']),             // obrigatório
translationKey: z.string().optional(),  // ausente = o próprio id
```

`lang` é obrigatório de propósito: um post novo sem ele falha o build com erro
explícito, em vez de ter um idioma escolhido por default.

A tradução declara o vínculo de um lado só:

```yaml
# src/content/blog/ola-mundo.md  ->  /pt/blog/ola-mundo/
title: "Olá, mundo"
lang: pt
translationKey: hello-world     # id do post em inglês
```

O post em inglês não escreve `translationKey`: a chave dele é o próprio id. O
pareamento vale nos dois sentidos.

### Alternativas descartadas

**Uma pasta por idioma** (`blog/en/`, `blog/pt/`). Derivaria `lang` do caminho,
mas como os slugs em português são diferentes por decisão, o `translationKey`
continuaria necessário — não elimina o campo frágil e ainda acrescenta o
prefixo `en/` a todo `post.id`, que passaria a ser removido em cada rota.

**Mesmo nome de arquivo dos dois lados como chave do par**, com `slug:` no
frontmatter dando a URL em português. Seria a mais limpa, com pareamento de
graça, mas não funciona: o `slug` do frontmatter substitui o id inteiro, então
`pt/ola-mundo.md` viraria id `ola-mundo` e a informação de idioma se perderia.

## `src/lib/posts.ts`

`selectPublished` não muda — segue o único decisor do que é publicado, e toda
página o chama primeiro. Em volta dele, funções puras:

```ts
byLang(posts, lang)              // filtra por idioma
translationKeyOf(post)           // data.translationKey ?? post.id
findTranslation(posts, post)     // mesma chave, outro idioma
buildTranslations(posts)         // Map<chave, {en?, pt?}>, lança em duplicata
postHref(post)                   // /blog/x/ ou /pt/blog/x/
```

`findTranslation` recebe a lista **já filtrada por `selectPublished`**. Daí sai
de graça o comportamento com rascunhos: um post em português cuja versão em
inglês ainda é `draft: true` não encontra par em produção, o seletor some, e
nenhuma rota aponta para página inexistente.

`buildTranslations` lança quando dois posts do mesmo idioma reivindicam a mesma
chave. Como as rotas de post a chamam no `getStaticPaths`, a colisão para o
build.

**Risco aceito:** um `translationKey` com erro de digitação não quebra nada —
apenas o par some, em silêncio. Evitá-lo exigiria o campo obrigatório dos dois
lados, cerimônia que não se paga num blog deste tamanho.

## Rotas

| Rota | Estado | Conteúdo |
|---|---|---|
| `/` | alterada | Home; 5 posts recentes **em inglês** |
| `/blog/` | alterada | Só posts `lang: en` |
| `/blog/<slug>/` | alterada | Só posts `lang: en` |
| `/rss.xml` | alterada | Só posts `lang: en`; `<language>en-us</language>` |
| `/pt/blog/` | nova | Só posts `lang: pt` |
| `/pt/blog/<slug>/` | nova | Só posts `lang: pt` |
| `/pt/rss.xml` | nova | Só posts `lang: pt`; `<language>pt-br</language>` |
| `/404` | inalterada | Serve os dois idiomas |

As rotas `/pt/blog/*` são quase idênticas às de `/blog/*`, com poucas linhas de
diferença. A duplicação é deliberada: uma rota `[lang]` unificada tornaria o
inglês `/en/...`, e o i18n nativo do Astro pressupõe o mesmo slug nos dois
idiomas, o que não vale aqui.

## `Base.astro`

Ganha duas props: `lang` (default `'en'`) e `translationHref` (opcional).

- `<html lang>` vira `pt-BR` nas páginas em português.
- O seletor renderiza `EN | PT` no `<nav>`, com o idioma atual em texto simples
  e o outro como link. Sem `translationHref`, não renderiza nada.
- `<link rel="alternate" hreflang>` para os dois idiomas mais `x-default`
  apontando para o inglês, emitido só quando o par existe.
- O `<link>` do RSS e o link "RSS" do rodapé apontam para o feed do idioma
  da página.
- `og:locale` acompanha o idioma.

### Sitemap

O `i18n` do `@astrojs/sitemap` **não** será usado. Ele pressupõe que a URL
traduzida é a mesma com prefixo de locale, e geraria
`/pt/blog/column-order-in-a-concatenated-index/` como alternativa — que é 404,
já que o slug em português é outro. O hreflang sai do `Base.astro`, onde o par
real é conhecido. O sitemap segue com a configuração atual.

## Testes

`src/lib/posts.test.ts` cobre, além dos casos atuais de `selectPublished`:

- `byLang` filtra por idioma
- `translationKeyOf` cai no id quando o campo está ausente
- `findTranslation` acha o par nos dois sentidos
- `findTranslation` não acha par de idioma igual
- `findTranslation` não acha par ausente da lista (o caso do rascunho)
- `buildTranslations` lança com `(chave, idioma)` duplicado
- `postHref` gera `/blog/` e `/pt/blog/`

O portão continua sendo `npm run check && npm test && npm run build`.

## Migração

Os dois posts existentes ganham `lang: en` e nada mais; as URLs não mudam.
Ambos são traduzidos para português, criando os primeiros pares e exercitando
o seletor de ponta a ponta.

`README.md`, `AGENTS.md` e `CLAUDE.md` documentam os campos novos.
