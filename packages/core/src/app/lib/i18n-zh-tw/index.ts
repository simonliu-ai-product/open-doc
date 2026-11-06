import { AGENT } from './agent';
import { AGENT_PANEL } from './agent-panel';
import { BROWSER } from './browser';
import { DOC } from './doc';
import { PANELS } from './panels';

export const ZH_TW: Record<string, string> = {
  ...BROWSER,
  ...DOC,
  ...PANELS,
  ...AGENT,
  ...AGENT_PANEL,
};
