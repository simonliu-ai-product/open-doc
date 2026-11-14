import { useMemo } from 'react';
import { useLocale as useAppLocale } from './i18n';

/**
 * The agent panel's strings in the shape its components read them — `t.agent.x`,
 * as in open-slide, so the panel stays easy to keep in step with it — each one
 * translated through the app's own dictionaries, keyed by its English text.
 */
const AGENT = {
  title: 'Agent',
  beta: 'Beta',
  betaTitle: 'Early preview',
  betaHint: 'Replies, edits and tool calls can occasionally fail or do something unexpected.',
  open: 'Agent',
  openTitle: 'Open the agent panel',
  close: 'Close agent panel',
  newSession: 'New chat',
  sessions: 'History',
  noSessions: 'No conversations yet.',
  deleteSession: 'Delete conversation',
  historyThisDoc: 'This document',
  historyOtherDocs: 'Other documents',
  historyEmptyHint: 'Chats you start in this panel show up here.',
  sessionRunning: 'Working',
  composerPlaceholder: 'Ask {provider} to create or edit documents…',
  send: 'Send',
  stop: 'Stop',
  working: 'Working',
  contextPage: 'Page {n}',
  contextSelection: 'Selection',
  pendingComments: {
    one: '{count} comment',
    other: '{count} comments',
  },
  applyComments: 'Apply comments',
  applyCommentsWith: 'Apply with {provider}',
  createDoc: 'Draft with agent',
  createDocWith: 'Create a document with {provider}',
  quickCreate: 'Draft a new document',
  quickCreateHint:
    'Opens a blank document; describe it and the agent drafts it section by section.',
  quickApply: 'Apply pending comments',
  quickApplyHint: 'Resolves every @doc-comment marker in this document.',
  quickTheme: 'Create a theme',
  quickThemeHint: 'Extracts or designs a reusable theme under themes/.',
  quickEdit: 'Edit this page',
  quickEditHint: 'Describe a change to the page you are viewing.',
  emptyTitle: 'What should we build?',
  emptyHint: 'Describe a document, or pick a starting point.',
  questionSubmit: 'Continue',
  questionOther: 'Other',
  questionOtherPlaceholder: 'Type your own answer',
  questionCancelled: 'Dismissed',
  permissionTitle: 'Needs approval',
  allow: 'Allow',
  deny: 'Deny',
  allowed: 'Allowed',
  denied: 'Denied',
  autoApprove: 'Auto-approve',
  autoApproveHint: 'Run commands without asking. Edits inside the workspace are always allowed.',
  resultDone: 'Done',
  resultStopped: 'Stopped',
  resultSeconds: '{seconds}s',
  errorEyebrow: 'Error',
  statusLoading: 'Checking agents',
  disabled: 'The agent panel is disabled in open-doc.config.ts.',
  connectTitle: 'Connect an agent',
  connectDescription:
    'Drive your coding agent from here instead of a terminal. Agents installed on this machine connect automatically and reuse their sign-in.',
  connect: 'Connect',
  connecting: 'Connecting',
  connected: 'Connected',
  connectInstallHint: 'Adds {pkg} to this workspace with {pm}.',
  cliFound: 'CLI found · v{version}',
  cliFoundNoVersion: 'CLI found',
  cliMissing: 'CLI not found on PATH',
  cliHint: 'Install the {name} CLI and sign in once; the panel reuses its login.',
  needCliTitle: 'Install Codex first',
  needCliDescription:
    'The panel drives the Codex CLI on this machine, and it was not found on your PATH. Install it, sign in once in a terminal with `codex`, then check again.',
  checkAgain: 'Check again',
  retry: 'Retry',
  toastConnected: '{name} connected',
  toastConnectFailed: 'Could not install {pkg}',
  manageConnections: 'Manage agents',
  backToChat: 'Back',
  toastSendFailed: 'Could not send message',
  newDocTitle: "What's this document about?",
  newDocHint:
    'Describe the topic, audience and tone. {provider} drafts it section by section while you watch.',
  newDocPlaceholder: 'A two-page project brief on…',
  toastCreateDocFailed: 'Could not create a document',
  steps: {
    one: '{count} step',
    other: '{count} steps',
  },
  questionSkip: 'Skip',
  copyMessage: 'Copy',
  copied: 'Copied',
  editMessage: 'Edit',
  cancelEdit: 'Cancel',
  sendEdit: 'Send',
  editHint:
    'Sending replaces the conversation after this message. Edits already made to files stay.',
  modelDefault: 'Default',
  reasoning: 'Reasoning',
  effortAuto: 'Auto',
  efforts: {
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'Extra high',
    max: 'Max',
  },
  checkRunning: 'Checking the document…',
  checkFailed: 'Could not check the document',
  checkClean: 'Checked · no problems',
  checkCleanPages: 'Checked · no problems · {count} pages',
  checkFound: { one: 'The check found {count} problem', other: 'The check found {count} problems' },
  checkMore: '+{count} more',
  checkFix: 'Ask the agent to fix',
  presenceEditing: '{provider} is editing',
  presenceThinking: 'Thinking',
  presenceWaiting: 'Waiting for you',
  preview: 'Preview version',
  previewHint: 'Its behavior, models and prices may change.',
  keyFound: 'GEMINI_API_KEY found',
  keyMissing: 'GEMINI_API_KEY not set',
  keyHint:
    'Add GEMINI_API_KEY to .env in this workspace, or to the environment the dev server runs in, then check again. The key stays on this machine.',
  notReadyApiKey: 'Set GEMINI_API_KEY and accept the preview terms to use {name}.',
  termsReview: 'Review terms',
  termsTitle: 'Before you use {name}',
  termsIntro: 'Read these terms. The panel runs {name} only after you accept them.',
  terms: {
    preview:
      'Antigravity here is a Google preview (antigravity-preview-09-2026). Its behavior, models, prices and availability may change or stop without notice, and this integration is itself an early prototype.',
    local:
      "With local mode on, open-doc downloads Google's gemini-api CLI (v0.4.6, checksum-verified) into node_modules/.open-doc and runs it while the dev server runs. The agent's file tools then work directly on this project folder on your computer, with shell commands disabled.",
    upload:
      "Without local mode, every turn uploads the open document's folder and the workspace's .agents/skills to a Google cloud sandbox. In both modes your messages and the files the agent reads are sent to Google through the Gemini API, so do not use it on documents you may not share with Google. The Gemini API terms apply, and on the free tier Google may use the data to improve its products.",
    billing:
      'Usage is billed to the key in GEMINI_API_KEY at Gemini API rates. One turn is capped at 500,000 tokens. The cost shown after a turn is an estimate; your Google bill is what counts.',
    writeBack:
      "In the cloud sandbox, the agent's edits are copied back into the document's folder when a turn ends; a file you changed during the turn is not overwritten, and deletions are not copied back. In local mode the agent edits your files directly. Either way, review the changes before you rely on them.",
    auth: 'open-doc uses only your API key. It never uses your Antigravity or Google account sign-in, and the key is never sent to the browser.',
    withdraw: 'You can withdraw your consent at any time from Manage agents.',
  },
  termsAgree: 'I have read and agree to these terms',
  termsAccept: 'Accept',
  termsAccepted: 'Terms accepted · {version}',
  termsWithdraw: 'Withdraw consent',
  toastTermsFailed: 'Could not save your answer',
  runtimeLocal: 'Runs on this computer · edits appear live',
  runtimeCloud: 'Runs in a Google cloud sandbox · edits arrive when a turn ends',
  runtimeEnable: 'Run on this computer',
  runtimeEnabling: 'Setting up local mode',
  runtimeHint:
    "Recommended. Downloads Google's gemini-api CLI into this project; no Docker or terminal needed.",
  runtimeUnsupported: 'Local mode is not available on this system yet.',
  toastLocalFailed: 'Could not set up local mode',
  enableTitle: 'Try {name}',
  enableHint:
    'Gemini edits this document right on your computer, and you watch each change land on the page.',
  enable: 'Enable',
  enableLater: 'Not now',
  notReadyTerms: 'Accept the preview terms to use {name}.',
};

type Strings<T> = { [K in keyof T]: T[K] extends string ? string : Strings<T[K]> };

function translateTree<T extends object>(tree: T, t: (text: string) => string): Strings<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tree)) {
    out[key] = typeof value === 'string' ? t(value) : translateTree(value as object, t);
  }
  return out as Strings<T>;
}

export function useLocale() {
  const { locale, t } = useAppLocale();
  return useMemo(() => ({ id: locale as string, agent: translateTree(AGENT, t) }), [locale, t]);
}

export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    vars[key] === undefined ? whole : String(vars[key]),
  );
}

export function plural(count: number, forms: { one: string; other: string }): string {
  return count === 1 ? forms.one : forms.other;
}
