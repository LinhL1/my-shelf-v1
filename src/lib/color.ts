function readPixels(canvas: HTMLCanvasElement, width: number, size: number) {
  const sample = document.createElement('canvas');
  sample.width = size;
  sample.height = size;
  const ctx = sample.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(canvas, 0, 0, width, canvas.height, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

function luma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** True when a page is a single flat colour, i.e. useless as a cover. */
export function isBlank(canvas: HTMLCanvasElement) {
  const data = readPixels(canvas, canvas.width, 96);
  let low = 255;
  let high = 0;
  for (let i = 0; i < data.length; i += 4) {
    const value = luma(data[i]!, data[i + 1]!, data[i + 2]!);
    low = Math.min(low, value);
    high = Math.max(high, value);
  }
  return high - low < 10;
}

/** Colour of the cover along its bound edge, so the spine reads as a continuation of it. */
export function spineColorFrom(canvas: HTMLCanvasElement) {
  const data = readPixels(canvas, Math.max(1, canvas.width * 0.05), 32);
  const count = data.length / 4;
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) sum[c]! += data[i + c]!;
  }
  return `#${sum.map((v) => Math.round(v / count).toString(16).padStart(2, '0')).join('')}`;
}

const CLOTH = ['#5b6770', '#6f5a4b', '#4f5d52', '#7a5c58', '#565a73', '#75694f'];

/** A muted cloth-like colour, stable for a given seed. */
export function clothColor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return CLOTH[hash % CLOTH.length]!;
}

export function isDark(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return luma(value >> 16, (value >> 8) & 255, value & 255) < 150;
}
