# Training Player

A PWA that walks you through a JSON-defined training plan one exercise at a time. It handles timers, rounds and rest, records what you did, and works offline. It's built for doing a workout without scrolling through a PDF.

The built-in plan is the 18-week heliski program (`plans/heliski.json`).

## Features

- **Today:** works out week, phase and weekday from the plan's start date. A Hotel/Home toggle picks the matching session, and the needed equipment is shown before you start.
- **Player:** big target or countdown and "Round 2/4", with load, tempo and notes.
  - Next/Back buttons or swipe.
  - Beeps with a 3-2-1 countdown, auto-advance, and rest screens with +15 s.
  - Swap to an alternative exercise.
  - The screen stays awake, and the session resumes after the app is closed.
- **Log:** the numbers each day asks for, pre-filled from the session (rounds completed, best wall-sit time, backpack kg). RPE is a 1–10 picker.
- **History:** per-day tables, trends and the weekly "vs. 3 weeks ago" check. Export as CSV.
- **Plans:** import JSON from a file or by pasting it. Validation errors show the exact path. Backup and restore everything as a single JSON file.

## Plan format

See [`spec/SPEC.md`](spec/SPEC.md) and the JSON Schema [`spec/training-plan.schema.json`](spec/training-plan.schema.json).

To generate a new plan from a PDF:
1. In the app, go to **Plans → Copy spec for an LLM**.
2. Paste the copied spec into an LLM together with the PDF.
3. Import the JSON it returns.

```sh
npm run validate -- path/to/plan.json   # check a plan locally
```

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # engine unit tests
npm run build      # production build into dist/
npm run preview    # serve dist/ (service worker active)
```

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. Under **Settings → Pages → Source**, choose **GitHub Actions**.

`.github/workflows/deploy.yml` tests, builds and deploys every push to `main` to `https://<user>.github.io/<repo>/`.

## Install on the iPhone

1. Open the Pages URL in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Launch it from the home screen. It runs full-screen and offline.

Notes:
- Beeps follow the ring/silent switch, and play over your music.
- Data lives only on the phone, so use **Plans → Export backup** now and then.
- Updates install automatically the next time you open the app while online.
