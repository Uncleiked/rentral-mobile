export type AccountExportFile = { append: (text: string) => Promise<void>; share: () => Promise<void>; remove: () => Promise<void> }
