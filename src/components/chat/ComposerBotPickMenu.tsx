import { botAvatarUrl } from '../../api/chatApi';
import type { ComposerBotPick } from '../../lib/composerBotPick';
import { IconClose } from '../AppIcons';
import { ChatAvatar } from './ChatAvatar';

export function ComposerBotPickMenu({
  items,
  activeIndex,
  onChoose,
  onHover,
}: {
  items: ComposerBotPick[];
  activeIndex: number;
  onChoose: (item: ComposerBotPick) => void;
  onHover?: (index: number) => void;
}) {
  return (
    <div className="chat-mention-menu chat-bot-pick-menu" role="listbox" aria-label="Chatbots và FAQ">
      {items.length > 0 ? (
        items.map((item, index) => (
          <button
            key={`${item.kind}-${item.id}`}
            type="button"
            className={index === activeIndex ? 'is-active' : ''}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHover?.(index)}
            onClick={() => onChoose(item)}
            role="option"
            aria-selected={index === activeIndex}
          >
            <ChatAvatar
              name={item.title}
              size={30}
              imageSrc={item.kind === 'bot' ? botAvatarUrl(item.avatarUrl) : undefined}
            />
            <span>
              <strong>{item.title}</strong>
              <small>{item.kind === 'faq' ? `FAQ · ${item.description}` : item.description}</small>
            </span>
          </button>
        ))
      ) : (
        <span className="chat-mention-empty">Không có Chatbots hoặc FAQ phù hợp.</span>
      )}
    </div>
  );
}

export function ComposerBotPickOverlay({
  loaded,
  items,
  activeIndex,
  onChoose,
  onHover,
}: {
  loaded: boolean;
  items: ComposerBotPick[];
  activeIndex: number;
  onChoose: (item: ComposerBotPick) => void;
  onHover?: (index: number) => void;
}) {
  if (!loaded) {
    return (
      <div className="chat-mention-menu chat-bot-pick-menu" role="status">
        <span className="chat-mention-empty">Đang tải Chatbots / FAQ…</span>
      </div>
    );
  }
  return (
    <ComposerBotPickMenu
      items={items}
      activeIndex={activeIndex}
      onChoose={onChoose}
      onHover={onHover}
    />
  );
}

export function ComposerBotPickBar({
  selected,
  asking,
  onClear,
  quoteHint,
}: {
  selected: ComposerBotPick;
  asking: boolean;
  onClear: () => void;
  quoteHint?: boolean;
}) {
  return (
    <div className="chat-reply-bar chat-bot-pick-bar">
      <ChatAvatar
        name={selected.title}
        size={28}
        imageSrc={selected.kind === 'bot' ? botAvatarUrl(selected.avatarUrl) : undefined}
      />
      <div>
        <strong>
          {asking ? 'Đang hỏi' : 'Soạn nháp với'} {selected.title}
        </strong>
        <span>
          {asking
            ? 'Đang hỏi AI Bots, vui lòng chờ…'
            : quoteHint
              ? 'Enter hỏi AI bằng tin trích dẫn — xem rồi gửi'
              : 'Enter hỏi AI — xem rồi gửi'}
        </span>
      </div>
      <button
        type="button"
        className="chat-icon-btn"
        disabled={asking}
        onClick={onClear}
        aria-label="Bỏ Chatbots"
      >
        <IconClose size={14} />
      </button>
    </div>
  );
}
