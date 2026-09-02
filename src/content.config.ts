import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
  schema: z
    .object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
      heroImage: z.string().optional(),
      // Astro's glob loader reads this raw frontmatter key to override the
      // generated entry id. It must stay valid under `.strict()`.
      slug: z.string().optional(),
    })
    .strict(),
});

export const collections = { blog };
