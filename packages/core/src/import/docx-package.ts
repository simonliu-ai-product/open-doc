import { strFromU8, unzipSync } from 'fflate';
import { elements, parseXml, type XmlElement } from './xml.ts';

/** The parts of a `.docx` both Word readers need: the body, its relationships, and a way to the rest. */
export class DocxError extends Error {}

export type Rel = { target: string; external: boolean; type: string };

export type DocxPackage = {
  files: Record<string, Uint8Array>;
  body: XmlElement;
  /** Folder of the main part (`word`), which relationship targets resolve against. */
  mainDir: string;
  rels: Map<string, Rel>;
  /** A part the main document points at by relationship type, e.g. `/styles`. */
  partOf: (suffix: string, fallback: string) => XmlElement | undefined;
  xmlPart: (name: string) => XmlElement | undefined;
};

const W_FALSE = new Set(['0', 'false', 'off', 'none']);

/** A toggle property: present without a value, or with a value that is not off. */
export function on(el: XmlElement | undefined): boolean | undefined {
  if (!el) return undefined;
  const value = el.attrs['w:val'];
  return value === undefined || !W_FALSE.has(value.toLowerCase());
}

export function val(el: XmlElement | undefined): string | undefined {
  return el?.attrs['w:val'];
}

export function num(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function resolvePart(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = baseDir ? baseDir.split('/') : [];
  for (const segment of target.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.' && segment !== '') parts.push(segment);
  }
  return parts.join('/');
}

function dirOf(part: string): string {
  const slash = part.lastIndexOf('/');
  return slash === -1 ? '' : part.slice(0, slash);
}

function relsPathFor(part: string): string {
  const dir = dirOf(part);
  const base = part.slice(dir.length ? dir.length + 1 : 0);
  return `${dir ? `${dir}/` : ''}_rels/${base}.rels`;
}

export function readRels(xml: XmlElement | undefined): Map<string, Rel> {
  const rels = new Map<string, Rel>();
  if (!xml) return rels;
  for (const el of elements(xml, 'Relationship')) {
    rels.set(el.attrs.Id ?? '', {
      target: el.attrs.Target ?? '',
      external: el.attrs.TargetMode === 'External',
      type: el.attrs.Type ?? '',
    });
  }
  return rels;
}

const NS: Record<string, string> = {};
const alias = (prefix: string, ...uris: string[]) => {
  for (const uri of uris) NS[uri] = prefix;
};
alias(
  'w',
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  'http://purl.oclc.org/ooxml/wordprocessingml/main',
);
alias(
  'r',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'http://purl.oclc.org/ooxml/officeDocument/relationships',
);
alias(
  'wp',
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  'http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing',
);
alias(
  'a',
  'http://schemas.openxmlformats.org/drawingml/2006/main',
  'http://purl.oclc.org/ooxml/drawingml/main',
);
alias(
  'pic',
  'http://schemas.openxmlformats.org/drawingml/2006/picture',
  'http://purl.oclc.org/ooxml/drawingml/picture',
);
alias(
  'm',
  'http://schemas.openxmlformats.org/officeDocument/2006/math',
  'http://purl.oclc.org/ooxml/officeDocument/math',
);
alias(
  'c',
  'http://schemas.openxmlformats.org/drawingml/2006/chart',
  'http://purl.oclc.org/ooxml/drawingml/chart',
);
alias('mc', 'http://schemas.openxmlformats.org/markup-compatibility/2006');
alias('v', 'urn:schemas-microsoft-com:vml');
alias('o', 'urn:schemas-microsoft-com:office:office');
alias('w10', 'urn:schemas-microsoft-com:office:word');
alias('wps', 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape');
alias('wpg', 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup');
alias('w14', 'http://schemas.microsoft.com/office/word/2010/wordml');
alias('dc', 'http://purl.org/dc/elements/1.1/');

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** An OLE compound file is either a Word 97–2003 .doc or an encrypted .docx. */
function oleMessage(bytes: Uint8Array): string | null {
  if (!OLE_MAGIC.every((byte, i) => bytes[i] === byte)) return null;
  // The encrypted package's stream name, UTF-16LE in the directory.
  const marker = 'EncryptedPackage';
  const probe = new TextDecoder('utf-16le').decode(
    bytes.subarray(0, Math.min(bytes.length, 1 << 20)),
  );
  if (probe.includes(marker)) {
    return 'the Word document is password-protected — open it in Word, remove the password (File › Info › Protect Document) and save it again';
  }
  return 'this is an older Word .doc file — save it as .docx (Word: File › Save As) and import that';
}

export function openDocx(bytes: Uint8Array): DocxPackage {
  const ole = oleMessage(bytes);
  if (ole) throw new DocxError(ole);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new DocxError(
      'not a Word .docx file — an older .doc must be saved as .docx (Word: File › Save As)',
    );
  }

  const xmlPart = (name: string): XmlElement | undefined => {
    const data = files[name];
    return data ? parseXml(strFromU8(data), NS) : undefined;
  };

  const packageRels = readRels(xmlPart('_rels/.rels'));
  const officeDoc = [...packageRels.values()].find((rel) => rel.type.endsWith('/officeDocument'));
  const mainPart = officeDoc ? resolvePart('', officeDoc.target) : 'word/document.xml';
  const document = xmlPart(mainPart);
  const bodies = document ? elements(document, 'w:body') : [];
  if (bodies.length === 0)
    throw new DocxError('not a Word document: the file has no document body');
  // Word reads every body some producers write, one after another.
  const body =
    bodies.length === 1 ? bodies[0] : { ...bodies[0], children: bodies.flatMap((b) => b.children) };

  const mainDir = dirOf(mainPart);
  const rels = readRels(xmlPart(relsPathFor(mainPart)));
  const partOf = (suffix: string, fallback: string) => {
    const rel = [...rels.values()].find((entry) => entry.type.endsWith(suffix));
    return xmlPart(rel ? resolvePart(mainDir, rel.target) : `${mainDir}/${fallback}`);
  };
  return { files, body, mainDir, rels, partOf, xmlPart };
}

const SYMBOLS: Record<number, string> = {
  108: '●',
  110: '■',
  111: '□',
  113: '❑',
  118: '❖',
  120: '☒',
  159: '•',
  161: '○',
  167: '▪',
  168: '□',
  216: '➢',
  252: '✓',
  253: '☒',
  254: '☑',
};

/**
 * A symbol-font glyph (Wingdings, Symbol) lives in the private use area, or
 * below 0x100 when `w:sym` names the font; show the Unicode look-alike. Forms
 * use Wingdings' box for "tick one", so it must stay a box.
 */
export function symbolText(text: string, symbolFont = false): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      const low =
        code >= 0xf000 && code <= 0xf0ff ? code - 0xf000 : symbolFont && code < 0x100 ? code : -1;
      if (low < 0) return char;
      return SYMBOLS[low] ?? '•';
    })
    .join('');
}
