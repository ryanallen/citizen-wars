# Spacewar Live

Spacewar 1985, remade for the browser and fought across the real stars near the Sun.

**Play: https://spacewarlive.com/**

Open the page and you are in a star system with whoever else is there, nearest the Sun first. There is nothing to type: the page finds the others through public Nostr relays and connects to them directly over WebRTC, with no server of its own. Send someone the address (it ends with the system, such as `#barnards-star`) and they land in the same system.

## Controls

Two hands: the mouse aims and fires, the left hand flies.

| | Your keys | Second player (offline) |
| --- | --- | --- |
| Aim | the mouse: the ship turns toward the pointer | |
| Thrust | W | keypad 8 or Up |
| Turn left / right | A / D | keypad 4 / 6 or Left / Right |
| Photon torpedo | left click or Space | keypad 9 or Enter |
| Phaser | right click or E | keypad 7 or / |
| Hyperspace | S or middle click | keypad 0 or 2, or Down |
| Cloak | Left Shift | keypad 5 or Right Shift |
| Shield into energy | Q or Z | keypad 1 or , |
| Energy into shield | C | keypad 3 or . |

**F10 changes your controls**: any action to any key or mouse button, two each, and mouse aim on or off. They are kept in your browser. Pressing a turn key takes the ship back from the mouse until the mouse moves again.

Tab shows the scoreboard, F8 turns sound on and off, F9 changes your call sign, and Esc goes to the offline game: the 1985 menu, two players on one keyboard or against the robots (F2 play, F3 and F4 robots, F5 planet, F6 gravity, F7 pause, F1 the help pages).

**Pickups** float in online systems and the practice round while connecting: fly into one to take it. A boxed lightning bolt fills your energy, even when it has run out; a boxed shield adds 32 shield; a boxed plus does both. A few are out at once, more as the system fills, and each blinks before it goes after about 28 seconds. The offline 1985 game has none, as the original had none.

## What it remakes

Spacewar Live remakes **Spacewar, © 1985 Bill Seiler**, shareware for the IBM PC. Every rule, speed, sprite, sound and screen was read from the original program's own code and checked against it running in DOSBox-X; the sprites, font and title letters are the original's.

## Sources

- The star systems and sky come from the **HYG Database** v4.1 by David Nash (astronexus), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The files derived from it, `public/systems.json` and `public/sky.bin`, are shared under the same licence.
- Star masses and radii come from **Eric Mamajek's** "A Modern Mean Dwarf Stellar Color and Effective Temperature Sequence".
- `src/vendor/noble-secp256k1.ts` is **noble-secp256k1** 3.2.0 by Paul Miller, MIT licence, copied whole.

## Building

```
npm ci
npm run dev        # http://localhost:5173/
npm test           # the game's tests
npm run test:live  # against the real relays
npm run build
```

`test.html?pilots=N` flies N robot test pilots from one tab.
