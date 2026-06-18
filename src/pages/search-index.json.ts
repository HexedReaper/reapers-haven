// ../src/pages/search-index.json.ts
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export async function GET() {
  const allTutorials = await getCollection('tutorials');
  const allGoods = await getCollection('goods');
  const combined_items = [...allGoods, ...allTutorials];
  const base = import.meta.env.BASE_URL || '';

  const search_list = combined_items.map((item) => ({
    title: item.data.title,
    url: `${base}/${item.collection}/${item.id}`,
    content: item.body
  }));

  return new Response(JSON.stringify(search_list), {
    headers: { 'Content-Type': 'application/json' }
  });
}