// FG's image window, reached from anywhere: the Images list, a book's page,
// its pictures, the Library. Every call opens the same image (one master per
// picture: its walls, doors, lights, paint and effects are kept by its id in
// the campaign), in the map window, for the GM alone until it is put in play.
// The app sets the opener once a table is hosted.
export type ImageRef = { book: string; name?: string; file?: string };
export type ImageOpened = { opened: string; id: string; onTable: boolean };

export const imageWindow: { open: ((image: ImageRef) => Promise<ImageOpened>) | null } = { open: null };

// Map Studio's window, opened at a page Kraken made for an image (the desktop sets it).
export const studioOpener: { open: ((url: string) => void) | null } = { open: null };
