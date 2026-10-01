import { Buffer } from 'node:buffer';
import type { PageChange } from './diff.ts';

export type DiffReportInput = {
  docId: string;
  title: string;
  since: string;
  commit: string;
  pages: PageChange[];
  /** PNGs of the old version's sheets, in its page order. */
  before: Uint8Array[];
  /** PNGs of the new version's sheets, in its page order. */
  after: Uint8Array[];
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dataUrl(png: Uint8Array | undefined): string {
  return png ? `data:image/png;base64,${Buffer.from(png).toString('base64')}` : '';
}

/** A sheet with its changed regions outlined, as percentages so it scales with the image. */
function sheet(png: Uint8Array | undefined, boxes: PageChange['boxes'], size: Size): string {
  const marks = boxes
    .map((box) => {
      const left = (box.x / size.width) * 100;
      const top = (box.y / size.height) * 100;
      const width = (box.width / size.width) * 100;
      const height = (box.height / size.height) * 100;
      return `<span class="mark" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;width:${width.toFixed(2)}%;height:${height.toFixed(2)}%"></span>`;
    })
    .join('');
  return `<div class="sheet"><img src="${dataUrl(png)}" alt="" />${marks}</div>`;
}

type Size = { width: number; height: number };

/** PNG width and height, read from the IHDR chunk. */
function sizeOf(png: Uint8Array | undefined): Size {
  if (!png || png.length < 24) return { width: 1, height: 1 };
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16) || 1, height: view.getUint32(20) || 1 };
}

const LABEL: Record<PageChange['status'], string> = {
  same: 'Unchanged',
  changed: 'Changed',
  added: 'Added',
  removed: 'Removed',
};

function pageName(change: PageChange): string {
  if (change.after !== null && change.before !== null && change.after !== change.before) {
    return `Page ${change.after} <span class="was">(was ${change.before})</span>`;
  }
  return `Page ${change.after ?? change.before}`;
}

function section(change: PageChange, input: DiffReportInput): string {
  const before = change.before === null ? undefined : input.before[change.before - 1];
  const after = change.after === null ? undefined : input.after[change.after - 1];
  const head = `<h2>${pageName(change)} <span class="badge ${change.status}">${LABEL[change.status]}</span></h2>`;

  if (change.status === 'added') {
    return `<section>${head}<div class="pair one"><figure class="added">${sheet(after, [], sizeOf(after))}<figcaption>New</figcaption></figure></div></section>`;
  }
  if (change.status === 'removed') {
    return `<section>${head}<div class="pair one"><figure class="removed">${sheet(before, [], sizeOf(before))}<figcaption>Removed</figcaption></figure></div></section>`;
  }

  const lines = change.lines
    .map(
      (line) =>
        `<li class="${line.op}"><span>${line.op === 'add' ? '+' : '−'}</span>${escapeHtml(line.text)}</li>`,
    )
    .join('');
  return (
    `<section>${head}<div class="pair">` +
    `<figure>${sheet(before, change.boxes, sizeOf(after))}<figcaption>Before · p. ${change.before}</figcaption></figure>` +
    `<figure>${sheet(after, change.boxes, sizeOf(after))}<figcaption>After · p. ${change.after}</figcaption></figure>` +
    `</div>${lines ? `<ul class="lines">${lines}</ul>` : '<p class="note">Only the drawing changed — no text was added or removed.</p>'}</section>`
  );
}

/**
 * The report `open-doc diff` writes: one self-contained HTML file, pictures
 * inlined, so it can be sent to a reviewer who has neither the repository nor
 * open-doc. Changed pages show before and after side by side with the changed
 * regions outlined and the text that moved listed beneath; unchanged pages are
 * a single line.
 */
export function renderDiffReport(input: DiffReportInput): string {
  const count = (status: PageChange['status']) =>
    input.pages.filter((page) => page.status === status).length;
  const changed = count('changed');
  const added = count('added');
  const removed = count('removed');
  const unchanged = input.pages.filter((page) => page.status === 'same');

  const summary =
    changed + added + removed === 0
      ? 'No changes.'
      : [
          changed && `${changed} changed`,
          added && `${added} added`,
          removed && `${removed} removed`,
          unchanged.length && `${unchanged.length} unchanged`,
        ]
          .filter(Boolean)
          .join(' · ');

  const body = input.pages
    .filter((page) => page.status !== 'same')
    .map((page) => section(page, input))
    .join('');
  const same = unchanged.length
    ? `<p class="note">Unchanged: ${unchanged.map((page) => `p. ${page.after}`).join(', ')}</p>`
    : '';

  const title = `${input.title} — changes since ${input.since}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { --text: #16181d; --muted: #6b7280; --rule: #e5e7eb; --bg: #f6f7f9; --add: #15803d; --remove: #b91c1c; --mark: #f59e0b; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 16px 64px; background: var(--bg); color: var(--text);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Noto Sans TC", "Segoe UI", sans-serif; }
  main { max-width: 1100px; margin: 0 auto; }
  header h1 { margin: 0 0 4px; font-size: 22px; }
  header p { margin: 0; color: var(--muted); }
  code { font: 12px ui-monospace, Menlo, monospace; }
  .summary { margin: 16px 0 8px; font-weight: 600; }
  section { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--rule); }
  h2 { margin: 0 0 12px; font-size: 16px; }
  .was { color: var(--muted); font-weight: 400; }
  .badge { margin-left: 6px; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; vertical-align: 2px; }
  .badge.changed { background: #fef3c7; color: #92400e; }
  .badge.added { background: #dcfce7; color: var(--add); }
  .badge.removed { background: #fee2e2; color: var(--remove); }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .pair.one { grid-template-columns: minmax(0, 520px); }
  @media (max-width: 720px) { .pair { grid-template-columns: 1fr; } }
  figure { margin: 0; }
  figcaption { margin-top: 6px; color: var(--muted); font-size: 12px; }
  .sheet { position: relative; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 0.12); }
  .sheet img { display: block; width: 100%; height: auto; }
  .added .sheet { outline: 3px solid var(--add); }
  .removed .sheet { outline: 3px solid var(--remove); opacity: 0.7; }
  .mark { position: absolute; border: 2px solid var(--mark); background: rgb(245 158 11 / 0.12); border-radius: 2px; }
  .lines { margin: 14px 0 0; padding: 0; list-style: none; font-size: 13px; }
  .lines li { display: flex; gap: 8px; padding: 2px 8px; border-radius: 4px; }
  .lines li span { flex: none; width: 1ch; font-weight: 700; }
  .lines .add { background: #f0fdf4; color: var(--add); }
  .lines .remove { background: #fef2f2; color: var(--remove); text-decoration: line-through; text-decoration-color: rgb(185 28 28 / 0.4); }
  .note { color: var(--muted); }
</style>
</head>
<body>
<main>
<header>
  <h1>${escapeHtml(input.title)}</h1>
  <p>Changes since <code>${escapeHtml(input.since)}</code> (<code>${escapeHtml(input.commit.slice(0, 7))}</code>) · <code>${escapeHtml(input.docId)}</code></p>
</header>
<p class="summary">${summary}</p>
${same}
${body}
</main>
</body>
</html>
`;
}
