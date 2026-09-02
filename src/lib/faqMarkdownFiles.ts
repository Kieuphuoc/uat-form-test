/** Trích file_id từ markdown FAQ. */
export function extractFaqMarkdownFileIds(markdown?: string | null): string[] {
  if (!markdown?.trim()) return [];
  const ids = new Set<string>();
  for (const match of markdown.matchAll(/faq-file:([a-f0-9]{32})/gi)) {
    if (match[1]) ids.add(match[1].toLowerCase());
  }
  for (const match of markdown.matchAll(/\/api\/files\/([a-f0-9]{32})(?:\/image\/\d+)?/gi)) {
    if (match[1]) ids.add(match[1].toLowerCase());
  }
  return [...ids];
}

/** faq-file: → URL File.Api (ảnh resize) để BlockNote/portal xem được. */
export function rewriteFaqFileUrlsForFileApi(
  markdown: string,
  filesBase: string,
  imageSize = 1024,
): string {
  if (!markdown.includes('faq-file:')) return markdown;
  const base = filesBase.replace(/\/+$/, '');
  return markdown.replace(
    /faq-file:([a-f0-9]{32})/gi,
    (_full, id: string) => `${base}/api/files/${id.toLowerCase()}/image/${imageSize}`,
  );
}

/** URL File.Api → faq-file: (lưu markdown FAQ chuẩn). */
export function normalizeFileApiUrlsToFaqFile(markdown: string): string {
  return markdown.replace(
    /\/api\/files\/([a-f0-9]{32})(?:\/image\/\d+)?/gi,
    (_full, id: string) => `faq-file:${id.toLowerCase()}`,
  );
}
