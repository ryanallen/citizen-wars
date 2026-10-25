# Citizen Wars

Spacewar 1985, remade for the browser and fought across the real stars near the Sun.

**Play: https://ryanallen.github.io/citizen-wars/**

Open the page and you are in a star system with whoever else is there, nearest the Sun first. There is nothing to type: the page finds the others through public Nostr relays and connects to them directly over WebRTC, with no server of its own. Send someone the address (it ends with the system, such as `#barnards-star`) and they land in the same system.

## Keys

| | Left keys | Or the right keys | |
| --- | --- | --- | --- |
| Phaser | Q | keypad 7 or I | |
| Cloak | W | keypad 8 or O | |
| Photon torpedo | E | keypad 9 or P | |
| Rotate anticlockwise | A | keypad 4 or K | |
| Impulse | S | keypad 5 or L | |
| Rotate clockwise | D | keypad 6 or ; | |
| Shield into energy | Z | keypad 1 or , | |
| Hyperspace | X | keypad 2 or . | |
| Energy into shield | C | keypad 3 or / | |

Online either set flies your ship. Tab shows the scoreboard, F8 turns sound on and off, F9 changes your call sign, and Esc goes to the offline game: the 1985 menu, two players on one keyboard or against the robots (F2 play, F3 and F4 robots, F5 planet, F6 gravity, F7 pause, F1 the help pages).

## What it remakes

Citizen Wars remakes **Spacewar, © 1985 Bill Seiler**, shareware for the IBM PC. Every rule, speed, sprite, sound and screen was read from the original program's own code and checked against it running in DOSBox-X; the sprites, font and title letters are the original's.

## Sources

- The star systems and sky come from the **HYG Database** v4.1 by David Nash (astronexus), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The files derived from it, `public/systems.json` and `public/sky.bin`, are shared under the same licence.
- Star masses and radii come from **Eric Mamajek's** "A Modern Mean Dwarf Stellar Color and Effective Temperature Sequence".
- `src/vendor/noble-secp256k1.ts` is **noble-secp256k1** 3.2.0 by Paul Miller, MIT licence, copied whole.

## Building

```
npm ci
npm run dev        # http://localhost:5173/citizen-wars/
npm test           # the game's tests
npm run test:live  # against the real relays
npm run build
```

`test.html?pilots=N` flies N robot test pilots from one tab.
