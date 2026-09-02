import type { ChatMessage } from '../api/chatApi';

export type FaqBuildPhase = 'idle' | 'answering' | 'preview' | 'saved';

const ASK_RE = /^\s*(?:\/\s*(hỏi|hoi)\s+(.+)|(?:hỏi|hoi)\s*:\s*(.+))$/i;
const DONE_RE = /^\s*(?:\/\s*(xong|hoàn thành|hoan thanh)\s*$|(?:xong|hoàn thành|hoan thanh)\s*:?\s*$)/i;
const OK_RE = /^\s*(?:\/\s*(ok|lưu|luu)\s*$|ok\s*:?\s*$)/i;
const APPROVE_RE = /^\s*\/\s*(duyệt|duyet)\s*$/i;
const RESET_RE = /^\s*\/\s*(reset|làm lại|lam lai)\s*$/i;
const ANSWER_PREFIX_RE = /^\s*(?:\/\s*(đáp|dap|trả lời|tra loi)\s+|(?:đáp|dap|trả lời|tra loi)\s*:\s*)/i;
const PREVIEW_MARKER = /Bấm icon \*\*Lưu\*\*|chat `\/Lưu`|chat \/Lưu/i;
const SAVED_MARKER = /Đã lưu nháp:/i;
const APPROVED_MARKER = /Đã duyệt:/i;

function isUserMessage(message: ChatMessage, selfUserId?: number) {
  if (selfUserId != null && message.sender_user_id != null) {
    return message.sender_user_id === selfUserId;
  }
  return message.sender_user_id != null && message.sender_user_id > 0;
}

function isBotMessage(message: ChatMessage, selfUserId?: number) {
  return !isUserMessage(message, selfUserId);
}

export function deriveFaqBuildPhase(
  messages: ChatMessage[],
  selfUserId?: number,
): FaqBuildPhase {
  let hasAsk = false;
  let hasDoneAfterAsk = false;
  let hasSaveAfterPreview = false;

  for (const message of messages) {
    const body = (message.body ?? '').trim();
    if (!body) continue;

    if (isUserMessage(message, selfUserId)) {
      if (ASK_RE.test(body)) {
        hasAsk = true;
        hasDoneAfterAsk = false;
        hasSaveAfterPreview = false;
        continue;
      }
      if (hasAsk && DONE_RE.test(body)) {
        hasDoneAfterAsk = true;
        continue;
      }
      if (hasDoneAfterAsk && OK_RE.test(body)) {
        hasSaveAfterPreview = true;
        continue;
      }
      if (APPROVE_RE.test(body)) {
        return 'idle';
      }
      if (RESET_RE.test(body)) {
        hasAsk = false;
        hasDoneAfterAsk = false;
        hasSaveAfterPreview = false;
      }
      continue;
    }

    if (isBotMessage(message, selfUserId)) {
      if (APPROVED_MARKER.test(body)) return 'idle';
      if (SAVED_MARKER.test(body)) return 'saved';
      if (PREVIEW_MARKER.test(body) && hasDoneAfterAsk) return 'preview';
    }
  }

  if (hasSaveAfterPreview) return 'saved';
  if (hasDoneAfterAsk) return 'preview';
  if (hasAsk) return 'answering';
  return 'idle';
}

export type FaqBuildValidation = {
  ok: boolean;
  error?: string;
  hint?: string;
};

export function validateFaqBuildSend(text: string, phase: FaqBuildPhase): FaqBuildValidation {
  const body = text.trim();
  if (!body) return { ok: true };

  if (ASK_RE.test(body)) {
    const match = body.match(ASK_RE);
    const question = (match?.[2] ?? match?.[3] ?? '').trim();
    if (!question) {
      return {
        ok: false,
        error: 'Thiếu nội dung câu hỏi.',
        hint: 'Ví dụ: `/Hỏi Làm sao để đăng ký tài khoản?`',
      };
    }
    return { ok: true };
  }

  if (RESET_RE.test(body)) return { ok: true };
  if (APPROVE_RE.test(body)) {
    if (phase !== 'saved') {
      return {
        ok: false,
        error: 'Chưa có mục để duyệt.',
        hint: 'Hãy `/Lưu` sau khi đã `/Xong` trước.',
      };
    }
    return { ok: true };
  }

  if (DONE_RE.test(body)) {
    if (phase === 'idle') {
      return {
        ok: false,
        error: 'Chưa có câu hỏi.',
        hint: 'Gửi `/Hỏi ...` trước, rồi `/Đáp` (có thể nhiều tin + ảnh), sau đó `/Xong`.',
      };
    }
    if (phase === 'preview' || phase === 'saved') {
      return {
        ok: false,
        error: 'Đã hoàn thành bản xem.',
        hint: 'Bấm icon Lưu hoặc gửi `/Lưu`. Gửi `/Làm lại` để làm từ đầu.',
      };
    }
    return { ok: true };
  }

  if (OK_RE.test(body)) {
    if (phase !== 'preview') {
      return {
        ok: false,
        error: 'Chưa có bản xem.',
        hint: 'Gửi `/Xong` sau khi đã nhập câu trả lời.',
      };
    }
    return { ok: true };
  }

  if (ANSWER_PREFIX_RE.test(body)) {
    if (phase === 'idle') {
      return {
        ok: false,
        error: 'Chưa có câu hỏi.',
        hint: 'Gửi `/Hỏi ...` trước khi `/Đáp`.',
      };
    }
    if (phase === 'preview' || phase === 'saved') {
      return {
        ok: false,
        error: 'Đã hoàn thành bản xem.',
        hint: 'Gửi `/Lưu` hoặc `/Làm lại` để bắt đầu lại.',
      };
    }
    return { ok: true };
  }

  if (phase === 'idle') {
    return {
      ok: false,
      error: 'Chưa đúng cú pháp dựng FAQ.',
      hint: 'Bắt đầu bằng `/Hỏi ...`. Gõ `/` để xem lệnh.',
    };
  }

  if (phase === 'preview' || phase === 'saved') {
    return {
      ok: false,
      error: 'Đang ở bước lưu hoặc duyệt.',
      hint: 'Gửi `/Lưu`, `/Duyệt` hoặc `/Làm lại`.',
    };
  }

  return { ok: true };
}

export type FaqSlashCommand = {
  code: string;
  label: string;
  insert: string;
  description?: string;
};

export function faqSlashCommands(canReview: boolean): FaqSlashCommand[] {
  const items: FaqSlashCommand[] = [
    { code: 'hoi', label: 'Hỏi', insert: '/Hỏi ', description: 'Nhập câu hỏi FAQ' },
    { code: 'dap', label: 'Đáp', insert: '/Đáp ', description: 'Nhập câu trả lời' },
    { code: 'xong', label: 'Xong', insert: '/Xong', description: 'Hoàn thành bản xem' },
    { code: 'luu', label: 'Lưu', insert: '/Lưu', description: 'Lưu nháp FAQ' },
    { code: 'lamlai', label: 'Làm lại', insert: '/Làm lại', description: 'Xóa và bắt đầu lại' },
  ];
  if (canReview) {
    items.push({ code: 'duyet', label: 'Duyệt', insert: '/Duyệt', description: 'Duyệt mục vừa lưu' });
  }
  return items;
}

export function expandQuickMessage(
  text: string,
  quickMessages: { code: string; body_text: string }[],
): string {
  const match = text.match(/^\s*\/([A-Za-z0-9_]+)\s*$/);
  if (!match) return text;
  const code = match[1];
  const found = quickMessages.find((item) => item.code.toLowerCase() === code.toLowerCase());
  return found ? found.body_text : text;
}
