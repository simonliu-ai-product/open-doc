import { drawToPng } from '../rasterize';
import type { Media } from './model';

type Format = 'png' | 'jpeg' | 'gif';

function sniff(bytes: Uint8Array): Format | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
  return null;
}

type Picture = { bytes: Uint8Array; type: Format; drawn: boolean };

async function png(source: CanvasImageSource, size: { width: number; height: number }) {
  const blob = await drawToPng(source, size);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: 'png' as const, drawn: true };
}

/** A picture's own bytes when Word reads the format; otherwise what the browser decoded. */
async function readImage(img: HTMLImageElement, source: string, size: DOMRect): Promise<Picture> {
  // SVG, WebP, AVIF: formats Word may not open, so their bytes would be discarded anyway.
  if (!/\.(?:svg|webp|avif)(?:[?#]|$)/i.test(source)) {
    try {
      const response = await fetch(source);
      if (response.ok) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        const type = sniff(bytes);
        if (type) return { bytes, type, drawn: false };
      }
    } catch {
      /* Drawn below from what the page already decoded. */
    }
  }
  return png(img, size);
}

/** Cropped, rounded, or filtered on the page: the file is not what the reader sees. */
function reshaped(img: HTMLImageElement): boolean {
  const cs = getComputedStyle(img);
  return (
    cs.objectFit !== 'fill' ||
    cs.borderRadius !== '0px' ||
    cs.clipPath !== 'none' ||
    cs.filter !== 'none'
  );
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The package's pictures, each stored once however many times the document shows it. */
export class MediaStore {
  readonly media: Media[] = [];
  private readonly bySource = new Map<string, number>();
  /** By byte length: two different pictures of exactly one size are rare, and told apart byte by byte. */
  private readonly byLength = new Map<number, number[]>();

  constructor(private readonly rasterize: (el: Element) => Promise<Uint8Array | null>) {}

  /** The index of a picture of `el`, or null when none could be made. */
  async of(el: Element, rect: DOMRect): Promise<number | null> {
    const img = el instanceof HTMLImageElement ? el : null;
    const source = img && !reshaped(img) ? img.currentSrc || img.src : '';
    const known = source ? this.bySource.get(source) : undefined;
    if (known !== undefined) return known;

    let picture: Picture | null = null;
    try {
      if (img && source) picture = await readImage(img, source, rect);
      else if (el instanceof HTMLCanvasElement) picture = await png(el, rect);
      else {
        const bytes = await this.rasterize(el);
        picture = bytes && { bytes, type: 'png', drawn: true };
      }
    } catch {
      // A cross-origin picture taints the canvas and cannot be read back.
      return null;
    }
    if (!picture) return null;

    // Matched on what was drawn, not on what drew it: two canvases with the
    // same markup can hold different charts, and one SVG in two colours is two
    // pictures — while the logo in every section's footer is still one.
    const { bytes, type } = picture;
    const candidates = this.byLength.get(bytes.length) ?? [];
    let index = candidates.find((i) => same(this.media[i].bytes, bytes));
    if (index === undefined) {
      index = this.media.length;
      this.media.push({ name: `image${index + 1}.${type}`, contentType: `image/${type}`, bytes });
      this.byLength.set(bytes.length, [...candidates, index]);
    }
    // Only the file itself stands for its URL. A drawing of it is the size it was
    // drawn at, and the same logo larger on another page needs its own.
    if (source && !picture.drawn) this.bySource.set(source, index);
    return index;
  }
}
