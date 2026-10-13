# Training plan spec (specVersion 1)

A training plan is one JSON file that describes a whole multi-week program. The Training Player app loads it, works out which session is due today, and walks you through it one exercise at a time.

The formal definition is `training-plan.schema.json` (JSON Schema draft-07). This document explains the ideas behind it. A complete real-world example is `plans/heliski.json`.

## Overview

```
Plan
├── startDate              week 1 starts here (a Monday)
├── equipment{}            everything a session may need, by id
├── environments[]         where you train, e.g. Home (all equipment) / Hotel (none)
├── exercises{}            exercise library: name, instructions, cues, images, videos, alternatives
├── blocks{}               reusable blocks, e.g. a standard warm-up
├── phases[]               week ranges, e.g. Foundation = weeks 1–4
└── days[]                 one per training weekday
    ├── log[]              the numbers to record after the session
    └── sessions[]         one per (environment × phase group)
        └── blocks[]       block ids or inline blocks
            └── items[]    exercises with reps or duration
```

## How the app picks the session for a date

1. `week = floor((date - startDate) / 7 days) + 1`, and the weekday is the date's weekday.
2. The **phase** is the one whose `weeks: [first, last]` contains the week.
3. The **day** is the entry in `days[]` with that weekday. If there's no entry, it's a rest day.
4. The **session** is the first one in `day.sessions` that matches the environment the user chose and either:
   - has `weeks` containing the week (this wins), or
   - has `phases` containing the phase id, or has no `phases` at all.

Every (phase × environment) pair should have exactly one session per day. The validator warns when one is missing.

## Exercises

```json
"wall-sit": {
  "name": "Wall sit",
  "instructions": "Thighs parallel, back and head on the wall. **Pack on the thighs.**",
  "cues": ["Thighs parallel", "Knees over ankles"],
  "equipment": ["wall"],
  "media": [
    { "type": "image", "src": "data:image/png;base64,iVBORw0...", "alt": "Wall sit" },
    { "type": "youtube", "url": "https://www.youtube.com/watch?v=XXXXXXXXXXX", "start": 15 },
    { "type": "link", "url": "https://example.com/wall-sit", "title": "Form guide" }
  ],
  "alternatives": [{ "exercise": "single-leg-wall-sit", "when": "you want it harder" }]
}
```

- `instructions` is markdown-lite: blank lines separate paragraphs, and `**bold**` is supported.
- Images can be a base64 data URI (`png`, `jpeg`, `gif`, `webp`, `svg+xml`) or an `https` URL. Base64 images work offline and are stored once per exercise, however many sessions use it. Keep them small (under ~50 KB each).
- YouTube links can be `youtube.com/watch?v=`, `youtu.be/`, `/shorts/` or `/embed/`. They're played inside the app (privacy-enhanced mode) and need a connection.
- `alternatives` appear in the player with a **Use instead** button, e.g. "burpees if the chair is shaky".

## Blocks and items

A block is a group of items done for some number of rounds:

```json
{
  "title": "Circuit",
  "kind": "main",
  "rounds": 4,
  "restBetweenItems": 0,
  "restBetweenRounds": 60,
  "note": "45 s per exercise, no rest between exercises.",
  "items": [
    { "exercise": "jump-squat", "duration": 45 },
    { "exercise": "bulgarian-split-squat", "reps": 8, "perSide": true, "tempo": "3 s down",
      "load": { "kg": 10, "kgMax": 12, "placement": "back", "equipment": "backpack" } }
  ]
}
```

| Field | Meaning |
|---|---|
| `kind` | `warmup`, `main` (default), `finish` or `cooldown`. "Rounds completed" is counted on the `main` block with the most rounds. |
| `rounds` | Default 1. |
| `restBetweenRounds` | Seconds. Not added after the last round. |
| `restBetweenItems` | Seconds between items inside a round. |

An **item** is either **count-based** or **time-based**:

- `reps`: the player shows the target and waits for you to tap **Next**.
- `duration` (seconds): the player counts down, beeps at 3-2-1, and moves on automatically. Stopping early with **Done** records the actual time, e.g. a wall sit held until failure.

Other item fields:

| Field | Meaning |
|---|---|
| `perSide` | With `reps`: shown as "8 / side" in one step. With `duration`: split into a Left and a Right step. |
| `label` | Replaces the exercise name for this item, e.g. "Chair step-up". |
| `tempo`, `intensity`, `note` | Free text shown in the player, e.g. "3 s down", "hard", "No pack." |
| `load` | `{ kg, kgMax?, placement?, equipment? }`, shown as "10–12 kg on back". `equipment` adds that item to the session's needed equipment. |
| `equipment` | Overrides the exercise's equipment for this item (e.g. step-up on stairs at home). |
| `onlyRounds` | e.g. `[1, 3]`: the item only appears in rounds 1 and 3. Use it for alternating exercises. |

Intervals are timed items with no rest between them:

```json
{ "title": "RowErg intervals", "rounds": 6, "items": [
  { "exercise": "rowerg", "duration": 120, "intensity": "hard" },
  { "exercise": "rowerg", "duration": 60, "intensity": "easy" } ] }
```

### Choices

When a session offers "this OR that", use a choice. The user picks one before starting. The first option is the default.

```json
{ "label": "Wall sit variant", "choice": [
  { "exercise": "wall-sit", "duration": 180 },
  { "exercise": "single-leg-wall-sit", "duration": 40, "perSide": true } ] }
```

### Weekly progression

Any number field (`reps`, `duration`, `rounds`, rest values, `load.kg`) can be a progression instead of a plain number:

```json
"duration": { "base": 60, "fromWeek": 5, "perWeek": 15, "max": 120 }
```

The value is `base + perWeek × (week − fromWeek)`, clamped to `min`/`max`. Weeks before `fromWeek` use `base`. The example gives 60 s in week 5, 75 s in week 6, … and stays at 120 s from week 9 on.

## Environments and equipment

```json
"equipment": { "backpack": { "name": "Backpack 8–15 kg" }, "rowerg": { "name": "RowErg" } },
"environments": [
  { "id": "travel", "name": "Hotel", "equipment": ["chair", "wall"] },
  { "id": "home", "name": "Home", "equipment": ["backpack", "chair", "wall", "stairs", "rowerg"] }
]
```

The user switches environment with a toggle; the first environment in the list is the default. A session's needed equipment is collected from its exercises, item overrides and loads, and shown as chips before starting. The validator warns when a session needs equipment its environment doesn't list, e.g. a RowErg in the hotel.

## Logging

Each day lists the numbers to record after the session:

```json
"log": [
  { "id": "kg", "label": "Backpack kg", "type": "number", "unit": "kg", "autofill": "maxLoadKg", "environments": ["home"] },
  { "id": "rounds", "label": "Rounds", "type": "number", "autofill": "roundsCompleted" },
  { "id": "wallsit", "label": "Wall sit seconds (best set)", "type": "number", "unit": "s", "autofill": { "maxDuration": "wall-sit" } },
  { "id": "rpe", "label": "RPE", "type": "rpe", "target": [6, 7] }
]
```

- `type`: `number`, `rpe` (a 1–10 picker, with `target` highlighted), `boolean` or `text`.
- `environments`: only ask for this field in those environments.
- `autofill` pre-fills the form from the session:

| Value | Pre-fills with |
|---|---|
| `roundsCompleted` | Fully completed rounds of the main block |
| `maxLoadKg` | The heaviest load in the session |
| `durationMinutes` | Session length |
| `{ "maxDuration": "<exercise id>" }` | The longest time actually held on that exercise |

Use the same field `id` across weeks so the History screen can show trends and the "3 weeks ago" comparison.

## Rules of thumb for authors

- Ids are kebab-case (`bulgarian-split-squat`).
- Define every exercise once in `exercises` and reference it everywhere.
- Put repeated blocks (warm-up, finish) in `blocks` and reference them by id.
- Write a separate session for each environment, even if most of it is the same. Shared parts go into reusable blocks.
- Don't invent numbers. If the source says "30–45 s", use one value (e.g. 40) and put the range in `note`.

## Prompt for generating a plan with an LLM

> You convert training plans into JSON for the Training Player app. Output a single JSON object that validates against the attached JSON Schema (specVersion 1) and follows the spec above. Read the attached plan (PDF or text) completely and:
> - Put every distinct exercise once in `exercises`, with `instructions` and 2–3 `cues` taken from the source. Leave `media` out unless the source has image or video links.
> - Model each place where the plan can be done (e.g. home with equipment vs. travel without) as an `environment` with its equipment list, and write one session per weekday × phase × environment.
> - Use `reps` for count-based items and `duration` (seconds) for time-based ones. Use `perSide`, `onlyRounds`, `choice`, `load` and progressions (`{ base, fromWeek, perWeek, max }`) wherever the source describes them.
> - Use shared `blocks` for anything repeated (warm-ups, finishers).
> - Add the `log` fields the source asks you to record.
> - Copy numbers exactly; don't invent sets, reps or loads.
> Output only the JSON.
