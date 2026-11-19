<div align="center">

# Arcadia

**Free play. Pick a cartridge. Press start.**

A living room for a collection of original browser games: an old TV and a console on a stand, with the cartridges lined up on the carpet. Flip through them and the TV changes channel to show each game in action; press **Press start** to play. It runs in any modern browser, on desktop or phone.

### [▶ Enter the arcade](https://leeeeeroyj.github.io/arcadia/)

[![Deploy](https://github.com/leeeeeroyj/arcadia/actions/workflows/deploy.yml/badge.svg)](https://github.com/leeeeeroyj/arcadia/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![Arcadia: a pink neon ARCADIA sign over a living room. A wood-grain CRT TV with rabbit ears shows Overtone's gameplay on channel 08; beside it a neon sign spells OVERTONE in the game's own font above its tagline and a Press Start button, and a cream console holds the Overtone cartridge with a joystick next to it, all on a wooden stand. Below, on carpet patterned with neon squiggles, a row of cartridges, each labelled in its game's font, with the selected one lifted and glowing between two arrow buttons](docs/screenshot.png)

</div>

## About

- **A cartridge for every game.** Each label carries the game's title in its own display font and colour. Flip through them with the arrow keys or the arrow buttons, click one, or swipe the row on a phone. The row wraps round.
- **A TV that plays.** The TV shows the chosen game: on desktop it runs the game itself, playing its own silent attract mode; on a phone it plays a short recorded loop of the same. Only one game runs at a time, and only while the TV is on screen. A channel change brings a burst of snow, the neon title flickers on and the cartridge drops into the console (none of that with reduced motion, which shows stills).
- **Know before you play.** The details under the title list the inputs the game takes. On a phone, games that need a keyboard or controller say so.
- **Your best score.** Games that save a high score show it under their tagline.
- **Back where you were.** The address keeps the channel (`#overtone`), so the browser's Back button from a game returns to it, and a link can point straight at one.
- **No build step.** Plain HTML, CSS and JavaScript, with the game list in one JSON file.

## The games

| Game | | Inputs |
| --- | --- | --- |
| [Space Raider](https://leeeeeroyj.github.io/space-raider/) | Blast the hostiles. Grab what glows. Get out alive. | Keyboard, controller, touch |
| [Space Raider 2](https://leeeeeroyj.github.io/space-raider-2/) | Voxel vaults. Bigger beams. Dodge the mortars. | Keyboard, controller, touch |
| [Mars Patrol](https://leeeeeroyj.github.io/mars-patrol/) | Jump the craters. Shoot the machines. Beat par. | Keyboard, controller, touch |
| [Sentinel](https://leeeeeroyj.github.io/sentinel/) | Hold the ring. Shoot the Snatchers. Catch the colonists. | Keyboard, controller, touch |
| [Hedge-Hogger](https://leeeeeroyj.github.io/hedge-hogger/) | Five hoglets. One night. There and back. | Keyboard, controller, touch |
| [Pro Racer Z](https://leeeeeroyj.github.io/pro-racer-z/) | Hover racing on the rooftops of a neon city. | Keyboard, controller |
| [Heroic Crusader](https://leeeeeroyj.github.io/heroic-crusader/) | Four beacons. One squire. The Gloam. | Keyboard, controller |
| [Overtone](https://leeeeeroyj.github.io/overtone/) | A shooter that keeps time. | Keyboard, controller, touch |

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
     "hiKey": "my-game-hi",
     "attract": true,
     "loop": true
   }
   ```

   `slug` is the game's repository name, so **Press start** links to `../<slug>/`. `hiKey` (optional) is the `localStorage` key where the game keeps its high score as a plain number; the games use `<slug>-hi`, and Arcadia shows it as "Your best". `attract` says the game has an attract mode (`?attract`: it plays itself, silently, ignoring input, and never writes storage).

   `font` (optional) is a CSS font stack for the game's title on the neon sign, the cartridge label and the console, usually the display font from the game's concept sheet; add the family to the Google Fonts link in `site/index.html`. Without it the title uses Bungee. `fontScale` (optional) sizes the title up or down for a font that reads small or large, such as `1.3`.
2. Put a 416 × 228 still in `site/screens/<slug>.png`.
3. Add it to `GAMES` in `tools/record-loops.mjs` with an attract seed, and record its loop (below).

On desktop, the TV runs the attract mode of a game with `"attract": true` live in an inert frame, once you've stayed on its channel for a moment. Phones play the recorded loop instead.

## Recording the loops

`tools/record-loops.mjs` opens each game's live Pages build in attract mode (`?attract&seed=<n>`) in headless Chrome, captures 8 seconds over the DevTools protocol, and encodes `site/loops/<slug>.webm` with ffmpeg. No input scripts: the games play themselves. It needs Node.js 22+, Google Chrome and ffmpeg.

```bash
node tools/record-loops.mjs            # every game
node tools/record-loops.mjs sentinel   # one game
```

## Run it locally

Any static file server works:

```bash
cd site && python3 -m http.server 8000   # http://localhost:8000
```

The **Press start** links (and the TV's live attract mode) point at sibling folders (`../<slug>/`), so they only reach the games on GitHub Pages.

Every push to `main` deploys `site/` to GitHub Pages.

## Project layout

```
site/
  index.html         the page shell: sign, TV, console, stand and the cartridge template
  style.css          the room, drawn in CSS
  arcadia.js         builds the cartridges from games.json, changes the channel, runs the TV
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
