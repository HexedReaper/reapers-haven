import { defineCollection } from 'astro:content';
import { z } from "astro/zod";
import { glob } from 'astro/loaders';

const tutorials = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/tutorials" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),

    //new clasification logic
    category: z.string().default("Uncategorized"),
    subcategory: z.string().optional(),
  }),
});

const goods = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/goods"}),
  schema: z.object({
    title: z.string(),
    description: z.string(),
  }),
});


export const collections = { tutorials, goods };