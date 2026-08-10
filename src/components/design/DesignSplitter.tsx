import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

type Props = {
  /** Kéo ngang: dương = kéo sang phải. */
  onDrag: (deltaX: number) => void;
  title?: string;
};

/** Thanh kéo mỏng giữa các panel Designer. */
export function DesignSplitter({ onDrag, title = 'Kéo để đổi kích thước' }: Props) {
  const lastX = useRef(0);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    lastX.current = e.clientX;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    if (dx !== 0) onDrag(dx);
  };

  return (
    <div
      className="design-splitter"
      role="separator"
      aria-orientation="vertical"
      title={title}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    />
  );
}
