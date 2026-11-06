import { UNTITLED_DOC_ID_RE } from '../editing/placeholder-id.ts';
import { parseQuestions } from './provider.ts';
import type { AgentQuestion, AgentTurnContext } from './types.ts';

const SECTION_BY_SECTION =
  'Write a new document section by section so the user can follow along on the page: first replace the file with the imports, meta (keeping its existing createdAt), design and the opening section only, then add each remaining section with its own separate edit, keeping the file compiling after every write.';

const DOC_SLUG =
  "This document's folder still has a placeholder name. Never rename or move the folder yourself: once the document has content, end your final reply with a slug for it on a line of its own as <doc-slug>short-kebab-case-english-slug</doc-slug>, and open-doc renames the folder from it.";

export type PromptOptions = {
  /** The workspace's documents folder, `docs` unless the config says otherwise. */
  docsDir: string;
  /** The dev server's own origin, for the single-page preview. */
  origin?: string;
};

export function systemPromptAppend(askInstruction: string, opts: PromptOptions): string {
  const preview = opts.origin
    ? `${opts.origin}/d/<id>/preview?p=<page>`
    : '/d/<id>/preview?p=<page> on the dev server';
  return [
    'You are running inside the open-doc dev server, driven from its in-app agent panel in the browser rather than a terminal.',
    `The workspace is an open-doc project: documents live under ${opts.docsDir}/<id>/index.tsx and the dev server hot-reloads every edit, so the user sees changes immediately.`,
    'Use the project skills: create-doc to draft a new document, apply-comments to resolve @doc-comment markers left by the inspector, create-theme for themes, and doc-authoring as the technical reference before writing a page.',
    SECTION_BY_SECTION,
    `After editing a document, run \`pnpm exec open-doc check <id>\` and fix what it reports. To look at one page as it prints, open ${preview} and wait for [data-od-preview-ready="true"].`,
    'Keep replies short and concrete: the panel is narrow. Prefer doing the work over describing it, and finish with a one-line summary of what changed.',
    askInstruction,
  ].join(' ');
}

export function buildTurnPrompt(
  text: string,
  context: AgentTurnContext | undefined,
  docsDir = 'docs',
): string {
  const lines = contextLines(context, docsDir);
  if (lines.length === 0) return text;
  return `${text}\n\n<open-doc-context>\n${lines.join('\n')}\n</open-doc-context>`;
}

// Document titles and selected text come from document content, so they sit in
// their own tags with `<` escaped and can't close the context block.
const escapeTag = (s: string) => s.replace(/</g, '&lt;');

function contextLines(context: AgentTurnContext | undefined, docsDir: string): string[] {
  if (!context?.docId) return [];
  const file = `${docsDir}/${context.docId}/index.tsx`;
  const lines: string[] = [];
  if (context.newDoc) {
    lines.push(
      `${file} is a blank document created for this request. Draft the document the user describes into it with the create-doc skill: replace the placeholder content, keep the document id, and do not create another folder.`,
      'Ask the create-doc scoping questions in a single round, only for what the request leaves unclear; skip any it already answers.',
      SECTION_BY_SECTION,
      DOC_SLUG,
    );
    return lines;
  }
  lines.push(`The user is viewing document "${context.docId}": ${file}.`);
  if (UNTITLED_DOC_ID_RE.test(context.docId)) lines.push(DOC_SLUG);
  if (context.docTitle) {
    lines.push(`<doc-title>${escapeTag(context.docTitle)}</doc-title>`);
  }
  if (context.pageNumber && context.totalPages) {
    lines.push(
      `They are on page ${context.pageNumber} of ${context.totalPages} as the document prints.`,
    );
  }
  if (context.selection) {
    const { line, column, tagName, text } = context.selection;
    lines.push(
      `They have selected a <${escapeTag(tagName)}> element at ${file}:${line}:${column}.${text ? ' Its text is in <selected-text>.' : ''} "This element" refers to it.`,
    );
    if (text) lines.push(`<selected-text>${escapeTag(text)}</selected-text>`);
  }
  if (context.pendingComments) {
    lines.push(
      `There are ${context.pendingComments} pending @doc-comment markers in this document's source.`,
    );
  }
  return lines;
}

const DOC_SLUG_RE = /\s*<doc-slug>\s*([^<]*?)\s*<\/doc-slug>\s*/gi;

export function extractDocSlug(text: string): string | null {
  let slug: string | null = null;
  for (const match of text.matchAll(DOC_SLUG_RE)) slug = match[1] || slug;
  return slug;
}

// Also drops a tag that is still streaming in, so the marker never flashes
// in the transcript.
export function stripDocSlug(text: string): string {
  return text
    .replace(DOC_SLUG_RE, '\n')
    .replace(/\s*<doc-slug>[^<]*$/i, '')
    .trimEnd();
}

export function applyCommentsPrompt(docId: string): string {
  return `Use the apply-comments skill to apply every pending @doc-comment marker in the document "${docId}", then remove the markers.`;
}

const QUESTIONS_RE = /<open-doc-questions>([\s\S]*?)<\/open-doc-questions>/i;

export const TEXT_QUESTIONS_INSTRUCTION =
  'You cannot ask the user anything interactively here, and nothing you print in the middle of a turn can be answered. When you need answers before continuing, stop working and end your turn with a final message holding only an <open-doc-questions> block: a JSON array of at most 4 questions shaped like [{"header":"Length","question":"How long should it be?","multiSelect":false,"options":[{"label":"2-3 pages (Recommended)","description":"A short brief"}]}], each with 2 to 4 options, written in the user\'s language. The panel shows them as a form and sends the answers back as your next message. Write nothing after the block and do not continue the task in the same turn.';

// Splits a reply written under TEXT_QUESTIONS_INSTRUCTION into its prose and
// questions. Returns null when the reply holds no usable block.
export function extractQuestionBlock(
  text: string,
): { text: string; questions: AgentQuestion[] } | null {
  const match = QUESTIONS_RE.exec(text);
  if (!match) return null;
  const body = match[1]
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  const questions = parseQuestions({
    questions: Array.isArray(raw) ? raw : (raw as { questions?: unknown } | null)?.questions,
  });
  if (questions.length === 0) return null;
  return { text: text.replace(QUESTIONS_RE, '').trim(), questions };
}

export function answersPrompt(
  questions: AgentQuestion[],
  answers: Record<string, string> | null,
): string {
  if (!answers) {
    return 'I skipped your questions. Continue the task with your best judgement and sensible defaults.';
  }
  const lines = questions.map((q) => `- ${q.question} ${answers[q.question] || '(no answer)'}`);
  return `My answers:\n${lines.join('\n')}\n\nContinue the task with these answers.`;
}

// For agents whose history can't be rewound: the edited message goes on top
// of the old conversation, so the agent is told to set that part aside.
export function editedPrompt(original: string, text: string): string {
  return `I went back and edited an earlier message of mine. Treat everything after it in this conversation, including your replies, as discarded, and respond to the edited version instead. Files keep whatever changes were already made.\n\n<original-message>\n${escapeTag(original)}\n</original-message>\n\n${text}`;
}

// For agents rewound to before the edited message: their history forgets the
// later turns, but the files on disk still hold what those turns wrote.
export function rewoundPrompt(text: string): string {
  return `${text}\n\n<open-doc-note>I went back and edited this message. Files keep the changes made after it in the discarded part of this conversation, so read the current files before editing them.</open-doc-note>`;
}
