export type OpenDocBuildConfig = {
  /** Ship the document browser (`/`) in the static build. Defaults to true. */
  showDocBrowser?: boolean;
  /** Offer the "Export HTML" button in the static build. Defaults to true. */
  allowHtmlExport?: boolean;
};

export type OpenDocGcpDeployConfig = {
  /** Google Cloud project ID. Falls back to `--project` or `gcloud config`. */
  project?: string;
  /** Cloud Run and Cloud Storage region. Defaults to `asia-east1`. */
  region?: string;
  /** Cloud Run service name. Defaults to package name or directory name. */
  service?: string;
  /** Cloud Storage bucket name for persistent docs/assets/themes. */
  bucket?: string;
  /**
   * `editable` runs `open-doc dev --mcp` backed by GCS FUSE so edits and
   * Antigravity MCP calls persist. `static` builds a read-only bundle.
   */
  mode?: 'editable' | 'static';
  /** Cloud Run container memory limit. Defaults to `1Gi`. */
  memory?: string;
};

export type OpenDocDeployConfig = {
  gcp?: OpenDocGcpDeployConfig;
};

export type OpenDocConfig = {
  base?: string;
  /**
   * Where the viewer's back affordance goes. Unset it points at this app's own
   * document browser; set it to escape the app entirely — a viewer mounted
   * under a larger site needs to return to that site, not to its own index.
   */
  home?: string;
  docsDir?: string;
  themesDir?: string;
  assetsDir?: string;
  port?: number;
  allowedHosts?: string[] | true;
  build?: OpenDocBuildConfig;
  deploy?: OpenDocDeployConfig;
};
