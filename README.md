# Ninja Grip

Endless rope-swinging ninja game (HTML / Canvas). Mobile-first (Android tilt), with **he-IL** (default) and **en-US** via i18next.

## Games included

- **Main run** — aim and shoot a Worms-style ninja rope at hanging targets, stand on platforms / hang from handles, survive forced right scroll
- **Battle** — side arena mini-game
- **Hide & Seek** — side finder mini-game

## How to run (no build, no `npx`)

Open [`index.html`](index.html) in a browser — works over `file://` (locales are embedded as JS).

**On a phone (recommended):** open the GitHub Pages URL:

- **Play:** https://hochgi.github.io/ninja_grip/  
  (may redirect via a custom domain — configure a dedicated subdomain if you prefer; `genpass` is unrelated)

Optional local static server is fine for development, but **not required**.

## Language

Default language is Hebrew (`he-IL`, RTL). Use the **EN / עב** toggle (top corner) to switch to English. Choice is saved in `localStorage`.

## Controls

| Action | Android / touch | Desktop |
|---|---|---|
| Start | **Play** → landscape fullscreen | Play |
| Swing / walk | Tilt phone sideways | A/D or arrows |
| Shorten rope / climb up | Tilt forward | W/↑ |
| Lengthen rope / climb down | Tilt back | S/↓ |
| Jump / detach | **Swipe up**, or **Jump** button | Shift |
| Aim + fire rope | **Tap / drag anywhere**, release to fire | Mouse + Space |

On phones, Play requests fullscreen and locks landscape so the browser toolbar does not steal vertical space.

## Project layout

```
index.html
css/game.css
js/…  (game modules + vendored i18next + motion.js)
locales/he-IL.js  locales/en-US.js   ← loaded by <script>, no fetch
locales/*.json                       ← edit these, regenerate .js
```

## עברית

אין צורך ב־`npx`. בטלפון פתחו:

https://hochgi.github.io/ninja_grip/

בקרות באנדרואיד: הטיה לנדנוד/אורך חבל, הקשה שמאל=קפיצה, ימין=ירי.
