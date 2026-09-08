import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { byLang, postHref, selectPublished } from '../lib/posts';

export async function GET(context: APIContext) {
  // O feed nunca inclui rascunhos, nem em desenvolvimento.
  const posts = byLang(selectPublished(await getCollection('blog')), 'en');

  return rss({
    title: 'Eduardo Faleiro',
    description: 'Notes on the things I build.',
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: postHref(post),
    })),
    customData: '<language>en-us</language>',
  });
}
