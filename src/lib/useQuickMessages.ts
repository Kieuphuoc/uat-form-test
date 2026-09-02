import { useEffect, useState } from 'react';
import { chatApi, type QuickMessage } from '../api/chatApi';

export function useQuickMessages(unitId?: number) {
  const [items, setItems] = useState<QuickMessage[]>([]);

  useEffect(() => {
    if (unitId != null && unitId <= 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    void chatApi
      .listQuickMessages()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [unitId]);

  return items;
}
