import { BROWSER } from './browser';
import { DOC } from './doc';
import { PANELS } from './panels';

export const KO: Record<string, string> = { ...BROWSER, ...DOC, ...PANELS };
