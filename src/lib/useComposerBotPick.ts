import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { chatApi } from '../api/chatApi';
import { loadChatBots } from './chatBotsCache';
import {
  buildComposerBotPicks,
  detectComposerBotPick,
  filterComposerBotPicks,
  type ComposerBotPick,
} from './composerBotPick';

export type BotAskResponseType = 'MD' | 'TEXT';

export function useComposerBotPick(responseType: BotAskResponseType = 'MD') {
  const [botOpen, setBotOpen] = useState(false);
  const [botQuery, setBotQuery] = useState('');
  const [botStart, setBotStart] = useState<number | null>(null);
  const [botIndex, setBotIndex] = useState(0);
  const [botPicks, setBotPicks] = useState<ComposerBotPick[]>([]);
  const [botPicksLoaded, setBotPicksLoaded] = useState(false);
  const [selectedBot, setSelectedBot] = useState<ComposerBotPick | null>(null);
  const [askingBot, setAskingBot] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  useEffect(() => {
    if (!botOpen || botPicksLoaded) return;
    let cancelled = false;
    void Promise.allSettled([loadChatBots(), chatApi.listFaqWorkbench()]).then((results) => {
      if (cancelled) return;
      const bots = results[0].status === 'fulfilled' ? results[0].value : [];
      const faqs = results[1].status === 'fulfilled' ? results[1].value : [];
      setBotPicks(buildComposerBotPicks(bots, faqs));
      setBotPicksLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [botOpen, botPicksLoaded]);

  const botMatches = botOpen ? filterComposerBotPicks(botPicks, botQuery) : [];

  const detectToken = useCallback((value: string, caret: number): boolean => {
    const hit = detectComposerBotPick(value, caret);
    if (!hit) {
      setBotOpen(false);
      setBotStart(null);
      return false;
    }
    setBotStart(hit.start);
    setBotQuery(hit.query);
    setBotIndex(0);
    setBotOpen(true);
    return true;
  }, []);

  const applyPick = useCallback(
    (item: ComposerBotPick, draft: string, caret: number): { next: string; caret: number } | null => {
      if (botStart == null) return null;
      const next = `${draft.slice(0, botStart)}${draft.slice(caret).replace(/^\s*/, '')}`;
      const nextCaret = botStart;
      setSelectedBot(item);
      setAskError(null);
      setBotOpen(false);
      setBotStart(null);
      return { next, caret: nextCaret };
    },
    [botStart],
  );

  const clearSelected = useCallback(() => {
    setSelectedBot(null);
    setAskError(null);
  }, []);

  const closeMenu = useCallback(() => setBotOpen(false), []);

  const ask = useCallback(
    async (question: string): Promise<string | null> => {
      if (!selectedBot || askingBot) return null;
      setAskingBot(true);
      setAskError(null);
      try {
        const result = await chatApi.askBotDraft(selectedBot.id, question, responseType);
        const answer = (result.body ?? '').trim();
        if (!answer) {
          setAskError('Không nhận được nội dung. Bạn có thể thử lại.');
          return null;
        }
        setSelectedBot(null);
        return answer;
      } catch (e) {
        setAskError(e instanceof Error ? e.message : 'Không hỏi được Chatbots. Hãy thử lại.');
        return null;
      } finally {
        setAskingBot(false);
      }
    },
    [askingBot, responseType, selectedBot],
  );

  const onMenuKeyDown = useCallback(
    (event: KeyboardEvent, onChoose: (item: ComposerBotPick) => void): boolean => {
      if (!botOpen) return false;
      if (event.key === 'ArrowDown' && botMatches.length > 0) {
        event.preventDefault();
        setBotIndex((index) => (index + 1) % botMatches.length);
        return true;
      }
      if (event.key === 'ArrowUp' && botMatches.length > 0) {
        event.preventDefault();
        setBotIndex((index) => (index - 1 + botMatches.length) % botMatches.length);
        return true;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && botMatches.length > 0) {
        event.preventDefault();
        onChoose(botMatches[botIndex] ?? botMatches[0]);
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setBotOpen(false);
        return true;
      }
      return false;
    },
    [botIndex, botMatches, botOpen],
  );

  return {
    botOpen,
    botMatches,
    botIndex,
    setBotIndex,
    botPicksLoaded,
    selectedBot,
    askingBot,
    askError,
    detectToken,
    applyPick,
    clearSelected,
    closeMenu,
    ask,
    onMenuKeyDown,
  };
}
