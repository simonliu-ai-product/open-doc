import { describe, expect, it } from 'vitest';
import { metafileToSvg } from './metafile.ts';

/** Little-endian record writer for building test metafiles. */
class Bytes {
  parts: number[] = [];
  u16(...values: number[]) {
    for (const v of values) this.parts.push(v & 0xff, (v >> 8) & 0xff);
    return this;
  }
  i16(...values: number[]) {
    return this.u16(...values.map((v) => v & 0xffff));
  }
  u32(...values: number[]) {
    for (const v of values)
      this.parts.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
    return this;
  }
  raw(bytes: number[]) {
    this.parts.push(...bytes);
    return this;
  }
  get length() {
    return this.parts.length;
  }
  done() {
    return new Uint8Array(this.parts);
  }
}

function wmf(records: Bytes[]): Uint8Array {
  const out = new Bytes()
    // Placeable header: key, handle, bbox 0,0–1000,500, 1000 units per inch, reserved, checksum.
    .u32(0x9ac6cdd7)
    .u16(0)
    .i16(0, 0, 1000, 500)
    .u16(1000)
    .u32(0)
    .u16(0)
    // Standard header: type, header words, version, size, objects, max record, members.
    .u16(1, 9, 0x300)
    .u32(0)
    .u16(4)
    .u32(0)
    .u16(0);
  for (const record of records) {
    const words = (4 + record.length) / 2;
    out.u32(words).raw(record.parts.slice(0, 2)).raw(record.parts.slice(2));
  }
  out.u32(3).u16(0);
  return out.done();
}

const rec = (fn: number) => new Bytes().u16(fn);

describe('metafileToSvg', () => {
  it('plays a WMF: a filled box and Big5 text where the window puts them', () => {
    const big5 = [0xa5, 0xd3, 0xbd, 0xd0]; // 申請
    const bytes = wmf([
      rec(0x020c).i16(500, 1000), // SetWindowExt (y, x)
      rec(0x02fc).u16(0).raw([0x00, 0x80, 0xff, 0x00]).u16(0), // CreateBrushIndirect: solid #0080ff
      rec(0x012d).u16(0), // SelectObject
      rec(0x041b).i16(200, 400, 100, 100), // Rectangle (bottom, right, top, left)
      // CreateFontIndirect: height −40, weight 700, charset Big5, face "PMingLiU"
      rec(0x02fb)
        .i16(-40, 0, 0, 0, 700)
        .raw([0, 0, 0, 136, 0, 0, 0, 0])
        .raw([...'PMingLiU'].map((c) => c.charCodeAt(0)).concat([0, 0])),
      rec(0x012d).u16(1),
      rec(0x0a32).i16(300, 500).u16(4, 0).raw(big5), // ExtTextOut (y, x, count, options)
    ]);
    const svg = metafileToSvg(bytes) ?? '';
    expect(svg).toContain('viewBox="0 0 1000 500"');
    expect(svg).toMatch(/<rect x="100" y="100" width="300" height="100" fill="#0080ff"/);
    expect(svg).toMatch(
      /<text x="500" y="300" font-size="40"[^>]*font-weight="bold"[^>]*>申請<\/text>/,
    );
  });

  it('plays an EMF polygon in the window its bounds come from', () => {
    const body = new Bytes();
    const records: Bytes[] = [];
    const add = (type: number, payload: Bytes) =>
      records.push(new Bytes().u32(type, 8 + payload.length).raw(payload.parts));
    add(39, new Bytes().u32(1, 0).raw([0x11, 0x22, 0x33, 0]).u32(0)); // CreateBrushIndirect #112233
    add(37, new Bytes().u32(1)); // SelectObject
    add(86, new Bytes().u32(0, 0, 0, 0, 3).i16(0, 0, 100, 0, 50, 80)); // Polygon16
    add(14, new Bytes().u32(0, 16, 0));
    const header = new Bytes()
      .u32(1, 88)
      .u32(0, 0, 99, 79) // bounds
      .u32(0, 0, 2646, 2117) // frame, .01 mm
      .u32(0x464d4520, 0x10000, 0, records.length + 1)
      .u16(0, 0)
      .u32(0, 0, 0)
      .u32(1920, 1080, 508, 286);
    for (const r of records) body.raw(r.parts);
    const bytes = new Bytes().raw(header.parts).raw(body.parts);
    // The header's own size and the file's.
    const out = bytes.done();
    new DataView(out.buffer).setUint32(48, out.length, true);
    const svg = metafileToSvg(out) ?? '';
    expect(svg).toContain('viewBox="0 0 100 80"');
    expect(svg).toMatch(/<polygon points="0,0 100,0 50,80" fill="#112233"/);
  });

  it('returns null for bytes that are not a metafile', () => {
    expect(metafileToSvg(new Uint8Array(64))).toBeNull();
  });
});
