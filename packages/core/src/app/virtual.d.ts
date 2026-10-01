declare module 'virtual:open-doc/docs' {
  import type { DocModule } from './lib/sdk';

  export const docIds: string[];
  export const docCreatedAt: Record<string, number>;
  export const docThemes: Record<string, string>;
  export const docTitles: Record<string, string>;
  export function loadDoc(id: string): Promise<DocModule>;
}

declare module 'virtual:open-doc/themes' {
  import type { ThemeDemoModule, ThemeMeta } from './lib/themes';

  export const themes: ThemeMeta[];
  export function loadThemeDemo(id: string): Promise<ThemeDemoModule>;
}

declare module 'virtual:open-doc/folders' {
  import type { FoldersManifest } from './lib/sdk';

  const manifest: FoldersManifest;
  export default manifest;
}

declare module 'virtual:open-doc/config' {
  import type { OpenDocConfig } from '../config';

  type ResolvedBuild = { showDocBrowser: boolean; allowHtmlExport: boolean };
  const config: OpenDocConfig & { build: ResolvedBuild; version: string };
  export default config;
}
