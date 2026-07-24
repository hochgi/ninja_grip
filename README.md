# Ninja Grip

Endless rope-swinging ninja game (HTML / Canvas). Mobile-first, with **he-IL** (default) and **en-US** via i18next.

## Games included

- **Main run** — aim and shoot a Worms-style ninja rope at hanging targets, stand on platforms / hang from handles, survive forced right scroll
- **Battle** — side arena mini-game
- **Hide & Seek** — side finder mini-game

## How to run (no build, no `npx`)

Open [`index.html`](index.html) in a browser — works over `file://` (locales are embedded as JS, nothing is fetched).

**On a phone:** use the hosted game URL (GitHub Pages) rather than transferring files or using a desktop LAN server:

- **Play:** https://hochgi.github.io/ninja_grip/

(After Pages is enabled / this branch is published.)

Optional local static server is still fine for development (`npx serve .` / `python3 -m http.server`), but it is **not required**.

## Language

Default language is Hebrew (`he-IL`, RTL). Use the **EN / עב** toggle (top corner) to switch to English. Choice is saved in `localStorage`.

## Controls

| Action | Mobile | Desktop |
|---|---|---|
| Move | ◀ ▶ | A/D or arrows |
| Aim | Aim pad | Mouse |
| Fire rope | Fire | Space |
| Shorten / lengthen | ↑ / ↓ rope | W/S or Q/E |
| Detach / jump | Jump | Shift |

## Project layout

```
index.html
css/game.css
js/…  (game modules + vendored i18next)
locales/he-IL.js  locales/en-US.js   ← loaded by <script>, no fetch
locales/*.json                       ← same strings (edit + regenerate .js if you prefer JSON)
```

## עברית

אין צורך ב־`npx`. פתחו את `index.html` בדפדפן, או שחקו מהקישור ב־GitHub Pages בטלפון:

https://hochgi.github.io/ninja_grip/
