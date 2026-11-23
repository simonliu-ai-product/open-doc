/**
 * Windows metafiles (WMF, EMF) as SVG, so the pictures Word files still carry
 * in them — equations from the old editor, Visio and Excel pastes, scanned
 * forms' line art — show in a browser. Only the drawing records such pictures
 * use are played: shapes, lines, paths, text and bitmaps, with pens, brushes
 * and fonts. EMF+ records ride inside comments and are skipped; the GDI
 * records drawn alongside them are enough.
 */

type Pen = { color: string; width: number; none: boolean };
type Brush = { color: string; none: boolean };
type Font = {
  size: number;
  weight: number;
  italic: boolean;
  family: string;
  angle: number;
  /** GDI's character set: which code page a WMF's text bytes are in. */
  charset?: number;
};
type Obj = { pen?: Pen; brush?: Brush; font?: Font };

type State = {
  pen: Pen;
  brush: Brush;
  font: Font;
  textColor: string;
  textAlign: number;
  evenOdd: boolean;
  orgX: number;
  orgY: number;
  extX: number;
  extY: number;
  x: number;
  y: number;
};

const BLACK_PEN: Pen = { color: '#000', width: 0, none: false };
const WHITE_BRUSH: Brush = { color: '#fff', none: false };
const DEFAULT_FONT: Font = { size: 12, weight: 400, italic: false, family: 'sans-serif', angle: 0 };

/** GDI's stock objects, which a selection may name instead of a created one. */
function stock(index: number): Obj | undefined {
  const gray = ['#fff', '#c0c0c0', '#808080', '#404040', '#000'];
  if (index <= 4) return { brush: { color: gray[index], none: false } };
  if (index === 5) return { brush: { color: '#000', none: true } };
  if (index === 6) return { pen: { color: '#fff', width: 0, none: false } };
  if (index === 7) return { pen: BLACK_PEN };
  if (index === 8) return { pen: { color: '#000', width: 0, none: true } };
  if (index >= 10 && index <= 17) return { font: DEFAULT_FONT };
  return undefined;
}

function colorRef(view: DataView, at: number): string {
  const r = view.getUint8(at);
  const g = view.getUint8(at + 1);
  const b = view.getUint8(at + 2);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function family(face: string): string {
  const name = face.replace(/\0.*$/s, '').trim();
  if (!name) return 'sans-serif';
  const generic = /times|roman|serif|明|宋|mincho/i.test(name) ? 'serif' : 'sans-serif';
  return `'${name.replace(/'/g, '')}', ${generic}`;
}

/** A DIB (header, palette, bits) as a BMP file a browser can draw. */
function bmpUri(dib: Uint8Array): string | null {
  if (dib.length < 40) return null;
  const view = new DataView(dib.buffer, dib.byteOffset, dib.byteLength);
  const headerSize = view.getUint32(0, true);
  const bits = view.getUint16(14, true);
  const used = headerSize >= 40 ? view.getUint32(32, true) : 0;
  const palette = bits <= 8 ? (used || 1 << bits) * 4 : 0;
  const masks = headerSize === 40 && view.getUint32(16, true) === 3 ? 12 : 0;
  const file = new Uint8Array(14 + dib.length);
  const out = new DataView(file.buffer);
  file[0] = 0x42;
  file[1] = 0x4d;
  out.setUint32(2, file.length, true);
  out.setUint32(10, 14 + headerSize + masks + palette, true);
  file.set(dib, 14);
  let binary = '';
  for (let i = 0; i < file.length; i += 0x8000) {
    binary += String.fromCharCode(...file.subarray(i, i + 0x8000));
  }
  return `data:image/bmp;base64,${btoa(binary)}`;
}

/** The Symbol font's letters, as the old equation editor drew Greek with them. */
const SYMBOL_FONT: Record<string, string> = Object.fromEntries(
  [...'abgdezhqiklmnxoprstufcywABGDEZHQIKLMNXOPRSTUFCYW'].map((c, i) => [
    c,
    'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'[i],
  ]),
);
Object.assign(SYMBOL_FONT, {
  '\xb4': '×',
  '\xb8': '÷',
  '\xb1': '±',
  '\xa3': '≤',
  '\xb3': '≥',
  '\xb9': '≠',
  '\xbb': '≈',
  '\xa5': '∞',
  '\xd6': '√',
  '\xe5': '∑',
  '\xf2': '∫',
  '\xb6': '∂',
  '\xd1': '∇',
  '\xae': '→',
  '\xac': '←',
  '\xb7': '•',
  '\xa2': '′',
  '\xb2': '″',
  '\xb0': '°',
});

/** A WMF's text bytes in the code page its font names. */
function decodeText(raw: Uint8Array, font: Font): string {
  const latin = new TextDecoder('latin1').decode(raw);
  if (/symbol/i.test(font.family) || font.charset === 2) {
    return [...latin].map((c) => SYMBOL_FONT[c] ?? c).join('');
  }
  if (!raw.some((b) => b > 0x7f)) return latin;
  const page: Record<number, string> = { 136: 'big5', 134: 'gbk', 128: 'shift_jis', 129: 'euc-kr' };
  try {
    return new TextDecoder(page[font.charset ?? 136] ?? 'windows-1252').decode(raw);
  } catch {
    return latin;
  }
}

class Canvas {
  out: string[] = [];
  state: State;
  saved: State[] = [];
  objects: Array<Obj | undefined> = [];
  path: string[] | null = null;
  constructor(public view: { x: number; y: number; w: number; h: number }) {
    this.state = {
      pen: BLACK_PEN,
      brush: WHITE_BRUSH,
      font: DEFAULT_FONT,
      textColor: '#000',
      textAlign: 0,
      evenOdd: true,
      orgX: view.x,
      orgY: view.y,
      extX: view.w,
      extY: view.h,
      x: 0,
      y: 0,
    };
  }

  /** Logical units to the picture's own, the window mapped onto the view box. */
  px(x: number): number {
    const s = this.state;
    return Math.round(((x - s.orgX) * (this.view.w / (s.extX || 1)) + 0) * 100) / 100;
  }
  py(y: number): number {
    const s = this.state;
    return Math.round(((y - s.orgY) * (this.view.h / (s.extY || 1)) + 0) * 100) / 100;
  }
  scale(): number {
    return Math.abs(this.view.w / (this.state.extX || 1));
  }

  select(obj: Obj | undefined) {
    if (!obj) return;
    if (obj.pen) this.state.pen = obj.pen;
    if (obj.brush) this.state.brush = obj.brush;
    if (obj.font) this.state.font = obj.font;
  }
  save() {
    this.saved.push({ ...this.state });
  }
  restore() {
    const state = this.saved.pop();
    if (state) this.state = state;
  }

  paint(fill: boolean, stroke: boolean): string {
    const { pen, brush } = this.state;
    const width = pen.width > 0 ? Math.max(0.5, pen.width * this.scale()) : 1;
    return [
      fill && !brush.none ? `fill="${brush.color}"` : 'fill="none"',
      fill && !brush.none && this.state.evenOdd ? 'fill-rule="evenodd"' : '',
      stroke && !pen.none ? `stroke="${pen.color}" stroke-width="${width}"` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  points(list: Array<[number, number]>): string {
    return list.map(([x, y]) => `${this.px(x)},${this.py(y)}`).join(' ');
  }

  poly(list: Array<[number, number]>, closed: boolean) {
    if (list.length === 0) return;
    if (this.path) {
      const [first, ...rest] = list;
      this.path.push(`M${this.px(first[0])} ${this.py(first[1])}`);
      for (const [x, y] of rest) this.path.push(`L${this.px(x)} ${this.py(y)}`);
      if (closed) this.path.push('Z');
      return;
    }
    const tag = closed ? 'polygon' : 'polyline';
    this.out.push(`<${tag} points="${this.points(list)}" ${this.paint(closed, true)}/>`);
  }

  polyPoly(lists: Array<Array<[number, number]>>, closed: boolean) {
    if (this.path) {
      for (const list of lists) this.poly(list, closed);
      return;
    }
    const d = lists
      .filter((list) => list.length > 0)
      .map(
        (list) =>
          `M${list.map(([x, y]) => `${this.px(x)} ${this.py(y)}`).join(' L')}${closed ? 'Z' : ''}`,
      )
      .join(' ');
    if (d) this.out.push(`<path d="${d}" ${this.paint(closed, true)}/>`);
  }

  bezier(list: Array<[number, number]>, from?: [number, number]) {
    const start = from ?? list[0];
    const rest = from ? list : list.slice(1);
    let d = this.path ? '' : `M${this.px(start[0])} ${this.py(start[1])}`;
    if (this.path && !from) d = `M${this.px(start[0])} ${this.py(start[1])}`;
    for (let i = 0; i + 2 < rest.length; i += 3) {
      d += ` C${rest
        .slice(i, i + 3)
        .map(([x, y]) => `${this.px(x)} ${this.py(y)}`)
        .join(' ')}`;
    }
    const last = rest[rest.length - 1];
    if (last) {
      this.state.x = last[0];
      this.state.y = last[1];
    }
    if (this.path) this.path.push(d);
    else this.out.push(`<path d="${d}" ${this.paint(false, true)}/>`);
  }

  rect(l: number, t: number, r: number, b: number, round = 0) {
    const x = Math.min(this.px(l), this.px(r));
    const y = Math.min(this.py(t), this.py(b));
    const w = Math.abs(this.px(r) - this.px(l));
    const h = Math.abs(this.py(b) - this.py(t));
    const rx = round ? ` rx="${Math.abs(round * this.scale()) / 2}"` : '';
    this.out.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx} ${this.paint(true, true)}/>`,
    );
  }

  ellipse(l: number, t: number, r: number, b: number) {
    const cx = (this.px(l) + this.px(r)) / 2;
    const cy = (this.py(t) + this.py(b)) / 2;
    const rx = Math.abs(this.px(r) - this.px(l)) / 2;
    const ry = Math.abs(this.py(b) - this.py(t)) / 2;
    this.out.push(
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${this.paint(true, true)}/>`,
    );
  }

  moveTo(x: number, y: number) {
    this.state.x = x;
    this.state.y = y;
    this.path?.push(`M${this.px(x)} ${this.py(y)}`);
  }

  lineTo(x: number, y: number) {
    if (this.path) this.path.push(`L${this.px(x)} ${this.py(y)}`);
    else if (!this.state.pen.none) {
      this.out.push(
        `<line x1="${this.px(this.state.x)}" y1="${this.py(this.state.y)}" x2="${this.px(x)}" y2="${this.py(y)}" ${this.paint(false, true)}/>`,
      );
    }
    this.state.x = x;
    this.state.y = y;
  }

  text(x: number, y: number, text: string) {
    const shown = text.replace(/\0+$/, '');
    if (!shown.trim()) return;
    const { font, textAlign, textColor } = this.state;
    const size = Math.max(1, Math.abs(font.size * this.scale()));
    const horizontal = textAlign & 6;
    const anchor = horizontal === 6 ? 'middle' : horizontal === 2 ? 'end' : 'start';
    // TA_BASELINE sets the point on the baseline; otherwise it is the top.
    const baseline =
      (textAlign & 24) === 24
        ? ''
        : (textAlign & 8) === 8
          ? ''
          : ' dominant-baseline="text-before-edge"';
    const bottom = (textAlign & 24) === 8 ? ' dominant-baseline="text-after-edge"' : '';
    const rotate = font.angle
      ? ` transform="rotate(${-font.angle / 10} ${this.px(x)} ${this.py(y)})"`
      : '';
    this.out.push(
      `<text x="${this.px(x)}" y="${this.py(y)}" font-size="${Math.round(size * 100) / 100}" font-family="${esc(font.family)}"${font.weight >= 600 ? ' font-weight="bold"' : ''}${font.italic ? ' font-style="italic"' : ''} fill="${textColor}" text-anchor="${anchor}"${bottom || baseline}${rotate} xml:space="preserve">${esc(shown)}</text>`,
    );
  }

  image(l: number, t: number, w: number, h: number, dib: Uint8Array) {
    const uri = bmpUri(dib);
    if (!uri) return;
    const x = Math.min(this.px(l), this.px(l + w));
    const y = Math.min(this.py(t), this.py(t + h));
    this.out.push(
      `<image x="${x}" y="${y}" width="${Math.abs(this.px(l + w) - this.px(l))}" height="${Math.abs(this.py(t + h) - this.py(t))}" preserveAspectRatio="none" href="${uri}"/>`,
    );
  }

  endPath(fill: boolean, stroke: boolean) {
    if (!this.path) return;
    const d = this.path.join(' ');
    this.path = null;
    if (d) this.out.push(`<path d="${d}" ${this.paint(fill, stroke)}/>`);
  }

  svg(): string | null {
    if (this.out.length === 0) return null;
    const { x, y, w, h } = this.view;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.abs(w)} ${Math.abs(h)}" preserveAspectRatio="none" data-origin="${x} ${y}">${this.out.join('')}</svg>`;
  }
}

function playWmf(bytes: Uint8Array): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  let box = { x: 0, y: 0, w: 0, h: 0 };
  if (view.getUint32(0, true) === 0x9ac6cdd7) {
    const left = view.getInt16(6, true);
    const top = view.getInt16(8, true);
    box = { x: left, y: top, w: view.getInt16(10, true) - left, h: view.getInt16(12, true) - top };
    at = 22;
  }
  const headerWords = view.getUint16(at + 2, true);
  at += headerWords * 2;
  // The window decides the drawing's frame when it is set before anything is drawn.
  let canvas: Canvas | null = null;
  const pending = { ...box };
  const ensure = () => {
    if (!canvas) {
      const frame = pending.w && pending.h ? pending : box;
      if (!frame.w || !frame.h) return null;
      canvas = new Canvas({ x: frame.x, y: frame.y, w: Math.abs(frame.w), h: Math.abs(frame.h) });
      canvas.state.extX = frame.w;
      canvas.state.extY = frame.h;
      if (frame.w < 0) canvas.state.orgX = frame.x;
      if (frame.h < 0) canvas.state.orgY = frame.y;
    }
    return canvas;
  };
  const objects: Array<Obj | undefined> = [];
  const add = (obj: Obj) => {
    const free = objects.indexOf(undefined);
    if (free === -1) objects.push(obj);
    else objects[free] = obj;
  };
  const i16 = (offset: number) => view.getInt16(offset, true);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const pointList = (start: number, count: number): Array<[number, number]> => {
    const list: Array<[number, number]> = [];
    for (let i = 0; i < count; i++) list.push([i16(start + i * 4), i16(start + i * 4 + 2)]);
    return list;
  };

  while (at + 6 <= bytes.length) {
    const size = view.getUint32(at, true) * 2;
    const fn = u16(at + 4);
    const p = at + 6;
    if (size < 6 || fn === 0) break;
    const c = canvas as Canvas | null;
    switch (fn) {
      case 0x020b: // SetWindowOrg
        pending.y = i16(p);
        pending.x = i16(p + 2);
        if (c) {
          c.state.orgX = pending.x;
          c.state.orgY = pending.y;
        }
        break;
      case 0x020c: // SetWindowExt
        pending.h = i16(p);
        pending.w = i16(p + 2);
        if (c) {
          c.state.extX = pending.w;
          c.state.extY = pending.h;
        }
        break;
      case 0x0209: {
        // SetTextColor
        const target = ensure();
        if (target) target.state.textColor = colorRef(view, p);
        break;
      }
      case 0x012e: {
        // SetTextAlign
        const target = ensure();
        if (target) target.state.textAlign = u16(p);
        break;
      }
      case 0x0106: {
        // SetPolyFillMode
        const target = ensure();
        if (target) target.state.evenOdd = u16(p) !== 2;
        break;
      }
      case 0x02fa: // CreatePenIndirect
        add({
          pen: { none: (u16(p) & 0xf) === 5, width: i16(p + 2), color: colorRef(view, p + 6) },
        });
        break;
      case 0x02fc: // CreateBrushIndirect
        add({ brush: { none: u16(p) === 1, color: colorRef(view, p + 2) } });
        break;
      case 0x02fb: {
        // CreateFontIndirect
        let face = '';
        for (let i = p + 18; i < Math.min(at + size, p + 50) && bytes[i]; i++)
          face += String.fromCharCode(bytes[i]);
        add({
          font: {
            size: i16(p),
            weight: i16(p + 8),
            italic: bytes[p + 10] !== 0,
            family: family(face),
            angle: i16(p + 4),
            charset: bytes[p + 13],
          },
        });
        break;
      }
      case 0x00f7: // CreatePalette
      case 0x01f9: // CreatePatternBrush
      case 0x0142: // DibCreatePatternBrush
      case 0x06ff: // CreateRegion
        add({});
        break;
      case 0x012d: // SelectObject
        ensure()?.select(objects[u16(p)]);
        break;
      case 0x01f0: // DeleteObject
        objects[u16(p)] = undefined;
        break;
      case 0x001e:
        ensure()?.save();
        break;
      case 0x0127:
        ensure()?.restore();
        break;
      case 0x0324: // Polygon
        ensure()?.poly(pointList(p + 2, u16(p)), true);
        break;
      case 0x0325: // Polyline
        ensure()?.poly(pointList(p + 2, u16(p)), false);
        break;
      case 0x0538: {
        // PolyPolygon
        const n = u16(p);
        let q = p + 2 + n * 2;
        const lists: Array<Array<[number, number]>> = [];
        for (let i = 0; i < n; i++) {
          const count = u16(p + 2 + i * 2);
          lists.push(pointList(q, count));
          q += count * 4;
        }
        ensure()?.polyPoly(lists, true);
        break;
      }
      case 0x041b: // Rectangle
        ensure()?.rect(i16(p + 6), i16(p + 4), i16(p + 2), i16(p));
        break;
      case 0x061c: // RoundRect
        ensure()?.rect(i16(p + 10), i16(p + 8), i16(p + 6), i16(p + 4), i16(p + 2));
        break;
      case 0x0418: // Ellipse
        ensure()?.ellipse(i16(p + 6), i16(p + 4), i16(p + 2), i16(p));
        break;
      case 0x0214: // MoveTo
        ensure()?.moveTo(i16(p + 2), i16(p));
        break;
      case 0x0213: // LineTo
        ensure()?.lineTo(i16(p + 2), i16(p));
        break;
      case 0x0521: {
        // TextOut
        const count = u16(p);
        const q = p + 2 + count + (count % 2);
        const target = ensure();
        if (target)
          target.text(
            i16(q + 2),
            i16(q),
            decodeText(bytes.subarray(p + 2, p + 2 + count), target.state.font),
          );
        break;
      }
      case 0x0a32: {
        // ExtTextOut
        const y = i16(p);
        const x = i16(p + 2);
        const count = u16(p + 4);
        const options = u16(p + 6);
        const start = p + 8 + (options & 6 ? 8 : 0);
        const target = ensure();
        if (target)
          target.text(x, y, decodeText(bytes.subarray(start, start + count), target.state.font));
        break;
      }
      case 0x0f43: {
        // StretchDIB
        const srcH = i16(p + 8);
        const srcW = i16(p + 10);
        const destH = i16(p + 16);
        const destW = i16(p + 18);
        const destY = i16(p + 20);
        const destX = i16(p + 22);
        void srcH;
        void srcW;
        ensure()?.image(destX, destY, destW, destH, bytes.subarray(p + 24, at + size));
        break;
      }
      case 0x0b41: {
        // DibStretchBlt
        const destH = i16(p + 14);
        const destW = i16(p + 16);
        const destY = i16(p + 18);
        const destX = i16(p + 20);
        if (size > 30)
          ensure()?.image(destX, destY, destW, destH, bytes.subarray(p + 22, at + size));
        break;
      }
      default:
        break;
    }
    at += size;
  }
  return (canvas as Canvas | null)?.svg() ?? null;
}

function playEmf(bytes: Uint8Array): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 1 || view.getUint32(40, true) !== 0x464d4520) return null;
  const i32 = (offset: number) => view.getInt32(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  const bounds = { l: i32(8), t: i32(12), r: i32(16), b: i32(20) };
  // What the picture shows is its bounds, drawn in device units: mapped back
  // through the viewport and window, they frame the drawing's own units.
  const mapping = { wx: 0, wy: 0, we: 0, wf: 0, vx: 0, vy: 0, ve: 0, vf: 0 };
  {
    // The mapping in force when the first thing is drawn.
    const drawing = new Set([
      2, 3, 4, 5, 6, 7, 8, 42, 43, 44, 54, 59, 76, 81, 84, 85, 86, 87, 88, 89, 90, 91,
    ]);
    let q = u32(4);
    while (q + 8 <= bytes.length) {
      const type = u32(q);
      const size = u32(q + 4);
      if (drawing.has(type) || type === 14 || size < 8) break;
      if (type === 9) [mapping.we, mapping.wf] = [i32(q + 8), i32(q + 12)];
      if (type === 10) [mapping.wx, mapping.wy] = [i32(q + 8), i32(q + 12)];
      if (type === 11) [mapping.ve, mapping.vf] = [i32(q + 8), i32(q + 12)];
      if (type === 12) [mapping.vx, mapping.vy] = [i32(q + 8), i32(q + 12)];
      q += size;
    }
  }
  const scaled = mapping.we && mapping.wf && mapping.ve && mapping.vf;
  const lx = (d: number) =>
    scaled ? ((d - mapping.vx) * mapping.we) / mapping.ve + mapping.wx : d;
  const ly = (d: number) =>
    scaled ? ((d - mapping.vy) * mapping.wf) / mapping.vf + mapping.wy : d;
  const frame = {
    x: lx(bounds.l),
    y: ly(bounds.t),
    w: lx(bounds.r + 1) - lx(bounds.l),
    h: ly(bounds.b + 1) - ly(bounds.t),
  };
  if (!frame.w || !frame.h) return null;
  const canvas = new Canvas({ x: frame.x, y: frame.y, w: Math.abs(frame.w), h: Math.abs(frame.h) });
  canvas.state.extX = frame.w;
  canvas.state.extY = frame.h;
  const objects: Array<Obj | undefined> = [];
  const pick = (index: number) =>
    index >= 0x80000000 ? stock(index - 0x80000000) : objects[index];
  const points16 = (start: number, count: number): Array<[number, number]> => {
    const list: Array<[number, number]> = [];
    for (let i = 0; i < count; i++)
      list.push([view.getInt16(start + i * 4, true), view.getInt16(start + i * 4 + 2, true)]);
    return list;
  };
  const points32 = (start: number, count: number): Array<[number, number]> => {
    const list: Array<[number, number]> = [];
    for (let i = 0; i < count; i++) list.push([i32(start + i * 8), i32(start + i * 8 + 4)]);
    return list;
  };

  let at = u32(4);
  while (at + 8 <= bytes.length) {
    const type = u32(at);
    const size = u32(at + 4);
    if (size < 8) break;
    const p = at + 8;
    switch (type) {
      case 19:
        canvas.state.evenOdd = u32(p) !== 2;
        break;
      case 22:
        canvas.state.textAlign = u32(p);
        break;
      case 24:
        canvas.state.textColor = colorRef(view, p);
        break;
      case 33:
        canvas.save();
        break;
      case 34:
        canvas.restore();
        break;
      case 38: // CreatePen
        objects[u32(p)] = {
          pen: { none: (u32(p + 4) & 0xf) === 5, width: i32(p + 8), color: colorRef(view, p + 16) },
        };
        break;
      case 95: // ExtCreatePen
        objects[u32(p)] = {
          pen: {
            none: (u32(p + 20) & 0xf) === 5,
            width: u32(p + 24),
            color: colorRef(view, p + 32),
          },
        };
        break;
      case 39: // CreateBrushIndirect
        objects[u32(p)] = { brush: { none: u32(p + 4) === 1, color: colorRef(view, p + 8) } };
        break;
      case 82: {
        // ExtCreateFontIndirectW
        let face = '';
        for (let i = 0; i < 32; i++) {
          const code = view.getUint16(p + 32 + i * 2, true);
          if (!code) break;
          face += String.fromCharCode(code);
        }
        objects[u32(p)] = {
          font: {
            size: i32(p + 4),
            weight: i32(p + 20),
            italic: bytes[p + 24] !== 0,
            family: family(face),
            angle: i32(p + 12),
          },
        };
        break;
      }
      case 37:
        canvas.select(pick(u32(p)));
        break;
      case 40:
        objects[u32(p)] = undefined;
        break;
      case 86: // Polygon16
        canvas.poly(points16(p + 20, u32(p + 16)), true);
        break;
      case 87: // Polyline16
        canvas.poly(points16(p + 20, u32(p + 16)), false);
        break;
      case 89: // PolylineTo16
        for (const [x, y] of points16(p + 20, u32(p + 16))) canvas.lineTo(x, y);
        break;
      case 3:
        canvas.poly(points32(p + 20, u32(p + 16)), true);
        break;
      case 4:
        canvas.poly(points32(p + 20, u32(p + 16)), false);
        break;
      case 85: // PolyBezier16
        canvas.bezier(points16(p + 20, u32(p + 16)));
        break;
      case 88: // PolyBezierTo16
        canvas.bezier(points16(p + 20, u32(p + 16)), [canvas.state.x, canvas.state.y]);
        break;
      case 90: // PolyPolyline16
      case 91: {
        // PolyPolygon16
        const n = u32(p + 16);
        let q = p + 24 + n * 4;
        const lists: Array<Array<[number, number]>> = [];
        for (let i = 0; i < n; i++) {
          const count = u32(p + 24 + i * 4);
          lists.push(points16(q, count));
          q += count * 4;
        }
        canvas.polyPoly(lists, type === 91);
        break;
      }
      case 43:
        canvas.rect(i32(p), i32(p + 4), i32(p + 8), i32(p + 12));
        break;
      case 44:
        canvas.rect(i32(p), i32(p + 4), i32(p + 8), i32(p + 12), i32(p + 16));
        break;
      case 42:
        canvas.ellipse(i32(p), i32(p + 4), i32(p + 8), i32(p + 12));
        break;
      case 27:
        canvas.moveTo(i32(p), i32(p + 4));
        break;
      case 54:
        canvas.lineTo(i32(p), i32(p + 4));
        break;
      case 59:
        canvas.path = [];
        break;
      case 61:
        canvas.path?.push('Z');
        break;
      case 62:
        canvas.endPath(true, false);
        break;
      case 63:
        canvas.endPath(true, true);
        break;
      case 64:
        canvas.endPath(false, true);
        break;
      case 84: {
        // ExtTextOutW
        const x = i32(p + 28);
        const y = i32(p + 32);
        const count = u32(p + 36);
        const offset = u32(p + 40);
        let text = '';
        for (let i = 0; i < count && at + offset + i * 2 + 1 < bytes.length; i++) {
          text += String.fromCharCode(view.getUint16(at + offset + i * 2, true));
        }
        canvas.text(x, y, text);
        break;
      }
      case 81: {
        // StretchDIBits
        const destX = i32(p + 16);
        const destY = i32(p + 20);
        const offBmi = u32(p + 40);
        const cbBmi = u32(p + 44);
        const offBits = u32(p + 48);
        const cbBits = u32(p + 52);
        const destW = i32(p + 64);
        const destH = i32(p + 68);
        if (cbBmi && cbBits) {
          const dib = new Uint8Array(cbBmi + cbBits);
          dib.set(bytes.subarray(at + offBmi, at + offBmi + cbBmi));
          dib.set(bytes.subarray(at + offBits, at + offBits + cbBits), cbBmi);
          canvas.image(destX, destY, destW, destH, dib);
        }
        break;
      }
      case 14:
        at = bytes.length;
        continue;
      default:
        break;
    }
    at += size;
  }
  return canvas.svg();
}

/** A WMF or EMF picture as SVG text, or null when it draws nothing this can play. */
export function metafileToSvg(bytes: Uint8Array): string | null {
  try {
    if (bytes.length < 44) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) === 1 && view.getUint32(40, true) === 0x464d4520)
      return playEmf(bytes);
    const kind = view.getUint32(0, true);
    if (kind === 0x9ac6cdd7 || view.getUint16(0, true) === 1 || view.getUint16(0, true) === 2) {
      return playWmf(bytes);
    }
    return null;
  } catch {
    return null;
  }
}
