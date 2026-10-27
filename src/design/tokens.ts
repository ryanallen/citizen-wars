// The design system in code: every value here is defined in
// spacewarlive/.agents/skills/design/design-system.md, which names its source.

/** Screen: CGA 640x200, black and white only, each pixel twice as tall as wide. */
export const SCREEN_W = 640;
export const SCREEN_H = 200;
export const PIXEL_ASPECT = 2;
export const COLOURS = { background: '#000000', foreground: '#ffffff' } as const;

/** Bars: shield on row 184, energy on row 192; labels S and E at x 10 and 630. */
export const BAR = { shieldY: 184, energyY: 192, labelLeftX: 10, labelRightX: 630 } as const;

/** The planet's place on the screen, in play and on the menu. */
export const PLANET_AT = { x: 319, y: 99 } as const;
export const MENU_PLANET_AT = { x: 592, y: 24 } as const;

/** Text: 10 pixels a character, 8 a line. */
export const TEXT = { advance: 10, line: 8 } as const;

/** PC speaker: frequency = PIT_HZ / divisor. */
export const PIT_HZ = 1193182;

/**
 * Sounds, as divisors or how they are made (design-system.md, Sound). The
 * simulation sets which one plays each tick; sound.ts turns it into a square wave.
 */
export const SOUND = {
  photonDivisor: 128,
  photonTicks: 2,
  warningDivisors: [1024, 2048] as const,
  warningSwapTicks: 32,
  phaserStep: 8,
  phaserScale: 8,
  hyperspaceScale: 256,
  torpedoExplosionBit: 0x2000,
} as const;
