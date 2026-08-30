export type OpenDocBuildConfig = {
  /** Ship the document browser (`/`) in the static build. Defaults to true. */
  showDocBrowser?: boolean;
  /** Offer the "Export HTML" button in the static build. Defaults to true. */
  allowHtmlExport?: boolean;
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
};
