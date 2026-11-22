import { strFromU8, unzipSync } from 'fflate';
import { child, elements, parseXml, type XmlElement } from './xml.ts';

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

export function openDocx(bytes: Uint8Array): DocxPackage {
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
    return data ? parseXml(strFromU8(data)) : undefined;
  };

  const packageRels = readRels(xmlPart('_rels/.rels'));
  const officeDoc = [...packageRels.values()].find((rel) => rel.type.endsWith('/officeDocument'));
  const mainPart = officeDoc ? resolvePart('', officeDoc.target) : 'word/document.xml';
  const body = child(xmlPart(mainPart), 'w:body');
  if (!body) throw new DocxError('not a Word document: the file has no document body');

  const mainDir = dirOf(mainPart);
  const rels = readRels(xmlPart(relsPathFor(mainPart)));
  const partOf = (suffix: string, fallback: string) => {
    const rel = [...rels.values()].find((entry) => entry.type.endsWith(suffix));
    return xmlPart(rel ? resolvePart(mainDir, rel.target) : `${mainDir}/${fallback}`);
  };
  return { files, body, mainDir, rels, partOf, xmlPart };
}
