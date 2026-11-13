# Match — a simple memory game (installable web app)

A mobile-first, app-style memory game. It runs in any browser and can be
installed to a phone's home screen as a standalone app (PWA), with offline support.

## Features
- Three levels (Easy 4×3, Medium 4×4, Hard 6×4) with move and time counters
- Native-style layout: top app bar, bottom tab bar (Play / Scores / Profile),
  slide transitions, safe-area support for notched phones, dark mode
- Local best scores and recent game history
- Profile with name and avatar, haptic feedback and optional sound
- Works offline after the first load (service worker cache)

## Run it
No build step is needed. Serve the repository root with any static server:

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

- http://localhost:8000/ is the website (landing page).
- http://localhost:8000/app/ is the game.

On a phone, use "Add to Home Screen" (or the Install button on the Profile tab).

## Layout
```
index.html, site.css  website (landing page)
app/
  index.html            markup and screens
  styles.css            theme, layout, animations
  app.js                game logic, navigation, storage
  sw.js                 service worker (offline cache)
  manifest.webmanifest  PWA install metadata
  icons/                app icons
```

Data is stored in the browser's `localStorage`, so nothing leaves the device.
