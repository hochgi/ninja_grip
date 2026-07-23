# Ninja Grip

Endless rope-swinging ninja game (HTML / Canvas). Mobile-first, with **he-IL** (default) and **en-US** via i18next.

## Games included

- **Main run** — aim and shoot a Worms-style ninja rope at hanging targets, stand on platforms / hang from handles, survive forced right scroll
- **Battle** — side arena mini-game
- **Hide & Seek** — side finder mini-game

## How to run

This is a static multi-file site (locales are fetched over HTTP). Open with a local static server:

```bash
npx --yes serve .
```

Then open the URL it prints (usually `http://localhost:3000`) on desktop or your phone (same Wi‑Fi).

Or deploy the folder to any static host / GitHub Pages.

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
js/main.js js/world.js js/rope.js js/i18n.js js/skins.js
js/battle.js js/hide-seek.js
js/vendor/i18next.min.js
locales/en-US.json locales/he-IL.json
```

## עברית

משחק נינג'ה עם חבל בסגנון Worms. להרצה מקומית:

```bash
npx --yes serve .
```

שפה ברירת מחדל: עברית. כפתור **EN / עב** מחליף לאנגלית.
