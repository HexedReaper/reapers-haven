// ..src/pages/search-index.json.ts
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// FIX: Strip markdown syntax for cleaner search snippets and better accuracy
function stripMarkdown(md: string): string {
  if (!md) return '';
  return md
    .replace(/```[\s\S]*?```/g, '') // Code blocks
    .replace(/`([^`]+)`/g, '$1') // Inline code
    .replace(/^#+\s+/gm, '') // Headers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
    .replace(/\*([^*]+)\*/g, '$1') // Italics
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .replace(/^\s*[-*+]\s+/gm, '') // List items
    .replace(/!\[.*?\]\(.*?\)/g, '') // Images
    .replace(/\n{2,}/g, '\n') // Multiple newlines
    .trim();
}

export async function GET() {
  const allTutorials = await getCollection('tutorials');
  const allGoods = await getCollection('goods');
  const combined_items = [...allGoods, ...allTutorials];
  const base = import.meta.env.BASE_URL || '';

  const search_list = combined_items.map((item) => ({
    title: item.data.title,
    url: `${base}/${item.collection}/${item.id}`,
    content: stripMarkdown(item.body || '')
  }));

  return new Response(JSON.stringify(search_list), {
    headers: { 'Content-Type': 'application/json' }
  });
}