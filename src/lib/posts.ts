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
