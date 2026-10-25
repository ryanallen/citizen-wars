// Drawn for Citizen Wars, not read from the original: the bar icons that take
// the place of the S and E letters (design-system.md, Bars). Same 16x8 box and
// columns as the font, so each sits where its letter did.

import type { Sheet } from './bitmaps';

export const ICON = { shield: 0, energy: 1 } as const;

export const icons: Sheet = {
  width: 16,
  height: 8,
  frames: [
    // Shield: a flat top, straight sides, tapering to a point.
    [0x7f80, 0x6180, 0x6180, 0x6180, 0x3300, 0x1e00, 0x0c00, 0],
    // Lightning bolt: down to the left, a bar across, down to the left again.
    [0x0700, 0x0e00, 0x1c00, 0x3f00, 0x0600, 0x0c00, 0x1800, 0],
  ],
};
