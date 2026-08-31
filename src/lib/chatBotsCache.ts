import { chatApi, type ChatBotCatalogItem } from '../api/chatApi';

const STORAGE_KEY = 'arito-chat:bots';

type CachePayload = {
  userId: number;
  unitId: number;
  items: ChatBotCatalogItem[];
};

let actorUserId = 0;
let actorUnitId = 0;

export function setChatBotCacheActor(userId: number, unitId: number): void {
  const nextUser = userId > 0 ? userId : 0;
  const nextUnit = unitId > 0 ? unitId : 0;
  if (actorUserId === nextUser && actorUnitId === nextUnit) return;
  actorUserId = nextUser;
  actorUnitId = nextUnit;
}

export function clearChatBotsCache(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

function readCache(): ChatBotCatalogItem[] | null {
  if (actorUserId <= 0) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (parsed.userId !== actorUserId || parsed.unitId !== actorUnitId || !Array.isArray(parsed.items)) {
      return null;
    }
    return parsed.items;
  } catch {
    return null;
  }
}

function writeCache(items: ChatBotCatalogItem[]): void {
  if (actorUserId <= 0) return;
  try {
    const payload: CachePayload = { userId: actorUserId, unitId: actorUnitId, items };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

/** Catalog bots (session). Đổi công ty / xóa cache thì fetch lại. */
export async function loadChatBots(): Promise<ChatBotCatalogItem[]> {
  const cached = readCache();
  if (cached) return cached;
  const result = await chatApi.listBots();
  const items = result.items ?? [];
  writeCache(items);
  return items;
}

export function activeChatBots(items: ChatBotCatalogItem[]): ChatBotCatalogItem[] {
  return items.filter((bot) => bot.active !== false);
}
