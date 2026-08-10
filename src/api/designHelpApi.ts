import { apiFetch, type ApiResult } from './client';

export type DesignHelpKind = 'design' | 'actions';

export type DesignHelpEmbed = {
  embedUrl: string;
  embedPath?: string;
  targetId?: string;
  kind: string;
  expiresAt?: string;
  userId?: number;
  historyEnabled?: boolean;
};

export async function fetchDesignHelpEmbed(
  kind: DesignHelpKind,
): Promise<ApiResult<DesignHelpEmbed>> {
  return apiFetch<DesignHelpEmbed>(
    `/v1/form/admin/design-help/embed?kind=${encodeURIComponent(kind)}`,
  );
}
