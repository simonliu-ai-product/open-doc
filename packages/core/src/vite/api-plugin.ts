import type { Plugin } from 'vite';
import { registerAssetRoutes } from './routes/assets.ts';
import { registerChangesRoutes } from './routes/changes.ts';
import { type ApiPluginOptions, makeContext } from './routes/context.ts';
import { registerDocRoutes } from './routes/docs.ts';
import { registerEditRoutes } from './routes/edit.ts';
import { registerFolderRoutes } from './routes/folders.ts';

export type { ApiPluginOptions };

// All open-doc dev-server endpoints in one plugin. Each file under `routes/`
// leads with a comment-block manifest of the endpoints it owns.
export function apiPlugin(opts: ApiPluginOptions): Plugin {
  return {
    name: 'open-doc:api',
    apply: 'serve',
    configureServer(server) {
      const ctx = makeContext(opts);
      registerAssetRoutes(server, ctx);
      registerFolderRoutes(server, ctx);
      registerDocRoutes(server, ctx);
      registerEditRoutes(server, ctx);
      registerChangesRoutes(server, ctx);
    },
  };
}
