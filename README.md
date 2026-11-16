<div align="center">

# Arcadia

**Free play. Six cabinets. Insert coin.**

An arcade floor for a collection of original browser games. Each cabinet shows its game in action; press **Insert coin** to play. It runs in any modern browser, on desktop or phone.

### [▶ Enter the arcade](https://leeeeeroyj.github.io/arcadia/)

[![Deploy](https://github.com/leeeeeroyj/arcadia/actions/workflows/deploy.yml/badge.svg)](https://github.com/leeeeeroyj/arcadia/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![Arcadia: a pink neon ARCADIA sign ringed with marquee bulbs over two rows of arcade cabinets on dark carpet patterned with neon squiggles. Each cabinet has a lit marquee lettered in its game's own font (stencil for Mars Patrol, pixel type for Sentinel, blackletter for Heroic Crusader), a gameplay screen, a joystick and an Insert Coin button](docs/screenshot.png)

</div>

## About

- **A cabinet for every game.** Each has a lit marquee lettered in its game's own display font, side art in its game's colour, a CRT screen with scanlines, and a control panel.
- **Screens that play.** Hover a cabinet, or scroll it into view on a phone, and its screen runs a short loop of real gameplay. Otherwise it shows a still.
- **Know before you play.** Every cabinet lists the inputs its game takes. On a phone, games that need a keyboard or controller say so.
- **Your best score.** Games that save a high score show it on their cabinet.
- **No build step.** Plain HTML, CSS and JavaScript, with the game list in one JSON file.

## The games

| Game | | Inputs |
| --- | --- | --- |
| [Space Raider](https://leeeeeroyj.github.io/space-raider/) | Blast the hostiles. Grab what glows. Get out alive. | Keyboard, controller, touch |
| [Mars Patrol](https://leeeeeroyj.github.io/mars-patrol/) | Jump the craters. Shoot the machines. Beat par. | Keyboard, controller, touch |
| [Sentinel](https://leeeeeroyj.github.io/sentinel/) | Hold the ring. Shoot the Snatchers. Catch the colonists. | Keyboard, controller, touch |
| [Hedge-Hogger](https://leeeeeroyj.github.io/hedge-hogger/) | Five hoglets. One night. There and back. | Keyboard, controller, touch |
| [Pro Racer Z](https://leeeeeroyj.github.io/pro-racer-z/) | Hover racing on the rooftops of a neon city. | Keyboard, controller |
| [Heroic Crusader](https://leeeeeroyj.github.io/heroic-crusader/) | Four beacons. One squire. The Gloam. | Keyboard, controller |

Each game is its own repository and GitHub Pages site. Arcadia links to them and lives beside them at `/arcadia/`.

## Adding a game

1. Add an entry to `site/games.json`:

   ```json
   {
     "slug": "my-game",
     "title": "My Game",
     "tagline": "One line that sells it.",
     "accent": "#5ef2ff",
     "inputs": ["keys", "pad", "touch"],
     "loop": true
   }
   ```

   `slug` is the game's repository name, so the cabinet links to `../<slug>/`. `hiKey` (optional) is the `localStorage` key where the game keeps its high score.

   `font` (optional) is a CSS font stack for the marquee title, usually the display font from the game's concept sheet; add the family to the Google Fonts link in `site/index.html`. Without it the marquee uses Bungee. `fontScale` (optional) sizes the title up or down for a font that reads small or large, such as `1.3`.
2. Put a 416 × 228 still in `site/screens/<slug>.png`.
3. Add a script for it to `tools/record-loops.mjs` and record its loop (below).

A game whose own attract mode can run in a frame gets `"attract": true` instead of showing the recorded loop on desktop. Phones keep the loop.

## Recording the loops

`tools/record-loops.mjs` plays each game in headless Chrome with a short input script, captures 8 seconds over the DevTools protocol, and encodes `site/loops/<slug>.webm` with ffmpeg. It needs Node.js 22+, Google Chrome and ffmpeg.

```bash
node tools/record-loops.mjs            # every game
node tools/record-loops.mjs sentinel   # one game
```

Most games are recorded from their live Pages builds. A few scripts need a game's dev-only hooks, such as Pro Racer Z's autopilot; those are recorded from a dev server built from that game's last commit, and expect its checkout beside this one.

## Run it locally

Any static file server works:

```bash
cd site && python3 -m http.server 8000   # http://localhost:8000
```

The **Insert coin** links point at sibling folders (`../<slug>/`), so they only reach the games on GitHub Pages.

Every push to `main` deploys `site/` to GitHub Pages.

## Project layout

```
site/
  index.html         the page shell and the cabinet template
  style.css          the sign, the carpet and the cabinets
  arcadia.js         builds the cabinets from games.json and runs the screen previews
  games.json         the game list
  screens/           one still per game
  loops/             one gameplay loop per game
tools/record-loops.mjs   records the loops
docs/screenshot.png      the image above
```

## Credits

- **Fonts:** [Monoton](https://fonts.google.com/specimen/Monoton) by Vernon Adams, [Bungee](https://fonts.google.com/specimen/Bungee) by David Jonathan Ross, and [VT323](https://fonts.google.com/specimen/VT323) by Peter Hull, all under the SIL Open Font License and served by Google Fonts.
- **Game screens and loops:** captured from the games themselves. Their sprites come from the CC0 [Angais/pixel-art-atlas-1.4m](https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m) collection of AI-generated pixel art.

## License

The code is released under the [MIT License](LICENSE). The game sprites shown in the screens and loops are CC0 (public domain), and the fonts are under the SIL Open Font License.
