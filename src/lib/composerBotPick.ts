import {
  botTypeLabel,
  isEmbedBot,
  type ChatBotCatalogItem,
  type FaqWorkbenchItem,
} from '../api/chatApi';
import { activeChatBots } from './chatBotsCache';

export type ComposerBotPick = {
  id: string;
  title: string;
  description: string;
  kind: 'bot' | 'faq';
  avatarUrl?: string | null;
};

export function buildComposerBotPicks(
  bots: ChatBotCatalogItem[],
  faqs: FaqWorkbenchItem[],
): ComposerBotPick[] {
  const botPicks: ComposerBotPick[] = activeChatBots(bots)
    .filter((bot) => !isEmbedBot(bot))
    .map((bot) => ({
      id: bot.folder_id,
      title: bot.title,
      description: botTypeLabel(bot),
      kind: 'bot',
      avatarUrl: bot.avatar_url,
    }));
  const faqPicks: ComposerBotPick[] = faqs
    .filter((item) => item.role === 'ask')
    .map((item) => ({
      id: item.workbench_id,
      title: item.title,
      description: item.name || 'FAQ',
      kind: 'faq',
    }));
  return [...botPicks, ...faqPicks];
}

export function detectComposerBotPick(
  value: string,
  caret: number,
): { start: number; query: string } | null {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(?:^|\s)@@([^\s@]*)$/);
  if (!match) return null;
  return { start: beforeCaret.lastIndexOf('@@'), query: match[1] };
}

export function filterComposerBotPicks(items: ComposerBotPick[], query: string): ComposerBotPick[] {
  const q = query.trim().toLocaleLowerCase('vi');
  const filtered = q
    ? items.filter(
        (item) =>
          item.title.toLocaleLowerCase('vi').includes(q) ||
          item.description.toLocaleLowerCase('vi').includes(q),
      )
    : items;
  return filtered.slice(0, 8);
}
