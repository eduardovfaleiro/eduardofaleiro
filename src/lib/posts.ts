export type Lang = 'en' | 'pt';

export const LANGS: readonly Lang[] = ['en', 'pt'];

export const DEFAULT_LANG: Lang = 'en';

/** Locale usado para formatar datas em cada idioma. */
export const LOCALES: Record<Lang, string> = {
  en: 'en-US',
  pt: 'pt-BR',
};

/** Valor do atributo `lang` do `<html>`. */
export const HTML_LANG: Record<Lang, string> = {
  en: 'en',
  pt: 'pt-BR',
};

export type PostLike = {
  id: string;
  data: {
    pubDate: Date;
    draft?: boolean;
    lang: Lang;
    translationKey?: string;
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

/** Filtra os posts de um idioma, preservando a ordem recebida. */
export function byLang<T extends PostLike>(posts: T[], lang: Lang): T[] {
  return posts.filter((post) => post.data.lang === lang);
}

/**
 * Chave que liga um post à sua tradução. Só a tradução declara
 * `translationKey`; do lado do original, a chave é o próprio id.
 */
export function translationKeyOf(post: PostLike): string {
  return post.data.translationKey ?? post.id;
}

/** URL de um post, no prefixo do idioma dele. */
export function postHref(post: PostLike): string {
  return post.data.lang === DEFAULT_LANG
    ? `/blog/${post.id}/`
    : `/${post.data.lang}/blog/${post.id}/`;
}

/** URL do índice do blog em um idioma. */
export function blogIndexHref(lang: Lang): string {
  return lang === DEFAULT_LANG ? '/blog/' : `/${lang}/blog/`;
}

/** URL do feed RSS de um idioma. */
export function rssHref(lang: Lang): string {
  return lang === DEFAULT_LANG ? '/rss.xml' : `/${lang}/rss.xml`;
}

/**
 * Agrupa posts por `translationKey`. Lança quando dois posts do mesmo idioma
 * reivindicam a mesma chave — como as rotas de post chamam isso no
 * `getStaticPaths`, a colisão para o build em vez de escolher um vencedor.
 */
export function buildTranslations<T extends PostLike>(
  posts: T[],
): Map<string, Partial<Record<Lang, T>>> {
  const groups = new Map<string, Partial<Record<Lang, T>>>();

  for (const post of posts) {
    const key = translationKeyOf(post);
    const group = groups.get(key) ?? {};
    const existing = group[post.data.lang];

    if (existing) {
      throw new Error(
        `Dois posts em "${post.data.lang}" compartilham translationKey "${key}": ` +
          `${existing.id} e ${post.id}.`,
      );
    }

    group[post.data.lang] = post;
    groups.set(key, group);
  }

  return groups;
}

/**
 * Encontra a versão de `post` no outro idioma dentro de `posts`.
 *
 * Passe uma lista já filtrada por `selectPublished`: é o que faz um post cuja
 * tradução ainda é rascunho não encontrar par em produção, sem código extra.
 */
export function findTranslation<T extends PostLike>(
  posts: T[],
  post: PostLike,
): T | undefined {
  const key = translationKeyOf(post);

  return posts.find(
    (candidate) =>
      candidate.data.lang !== post.data.lang && translationKeyOf(candidate) === key,
  );
}
