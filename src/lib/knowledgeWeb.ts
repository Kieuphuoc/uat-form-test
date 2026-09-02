/** URL portal Knowledge (iframe embed editor). */
export function getKnowledgeWebUrl(): string {
  const configured = (import.meta.env.VITE_KNOWLEDGE_WEB_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (import.meta.env.DEV) return 'http://localhost:3020';
  return 'https://portal.arito.net';
}
