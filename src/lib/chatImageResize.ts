/**
 * Resize ảnh chat ở client trước khi upload (paste clipboard, chọn file, kéo thả).
 * Chỉ thu nhỏ khi cạnh dài vượt ngưỡng; ảnh nhỏ hơn giữ nguyên file gốc.
 */

const RESIZABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function chatImageMaxSize(): number {
  const raw = Number((import.meta.env.VITE_CHAT_IMAGE_MAX_SIZE as string | undefined)?.trim());
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 1024;
}

async function loadBitmap(file: File): Promise<{ width: number; height: number; draw: CanvasImageSource; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    // Bake EXIF orientation: canvas không giữ EXIF nên ảnh điện thoại sẽ bị xoay nếu bỏ qua.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: bitmap,
      close: () => bitmap.close(),
    };
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Không đọc được ảnh.'));
      el.src = url;
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: image,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Trả về file đã thu nhỏ, hoặc chính file gốc nếu không cần / không resize được. */
export async function resizeChatImage(file: File, maxSize = chatImageMaxSize()): Promise<File> {
  if (maxSize <= 0 || !RESIZABLE_TYPES.includes(file.type)) return file;

  let source: Awaited<ReturnType<typeof loadBitmap>> | null = null;
  try {
    source = await loadBitmap(file);
    const longest = Math.max(source.width, source.height);
    if (longest <= maxSize) return file;

    const scale = maxSize / longest;
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(source.draw, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, file.type, file.type === 'image/jpeg' ? 0.88 : undefined);
    });
    // Ảnh PNG nhiều màu có thể phình sau khi encode lại → giữ file gốc.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    source?.close();
  }
}

/** Cắt giữa thành vuông rồi scale cạnh 256 — avatar chatbot trước khi upload File.Api. */
export async function resizeChatAvatar(file: File, size = 256): Promise<File> {
  if (size <= 0 || !RESIZABLE_TYPES.includes(file.type)) return file;

  let source: Awaited<ReturnType<typeof loadBitmap>> | null = null;
  try {
    source = await loadBitmap(file);
    const side = Math.min(source.width, source.height);
    if (side <= 0) return file;
    const sx = Math.floor((source.width - side) / 2);
    const sy = Math.floor((source.height - side) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source.draw, sx, sy, side, side, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.88);
    });
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, '') || 'avatar';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    source?.close();
  }
}
