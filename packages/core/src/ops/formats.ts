/** Kept apart from `layout.ts`, so the CLI can list the choices without loading the renderer. */
export const EXPORT_FORMATS = ['pdf', 'html', 'docx', 'png'] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];
