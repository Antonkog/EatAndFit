# Eat & Fit Product Specifications

## Document status

- Product: Eat & Fit web application
- Specification version: 1.4
- Implementation baseline: `main` as of October 30, 2026
- Language: English only
- Platforms: responsive web application for desktop and mobile browsers

This document is the product-level source of truth for implemented behavior. It describes the current application rather than planned or hypothetical functionality.

### Required maintenance rule

Every feature addition, behavior change, data-model change, provider change, calculation change, or user-visible removal must update this file in the same Git commit as the implementation. A feature is not complete until its product behavior and relevant constraints are mirrored here. Pure refactoring that does not change observable behavior does not require a specification change.

## 1. Product purpose

Eat & Fit combines exercise planning, workout history, food logging, recipe discovery, nutrition reference data, calorie-balance tracking, barcode lookup, and optional user-funded AI tools in one local-first application.

The product has no user accounts and no cloud synchronization. Personal profile information, workout history, food history, saved products, AI-provider preferences, and encrypted provider keys stay in the current browser unless a user explicitly sends content to an external provider or exports a history backup.

The application is educational. Exercise-energy and nutrition values are estimates and are not medical advice.

## 2. Product editions and feature availability

Eat & Fit is built in two free editions.

| Capability | Core edition | BYOK AI edition |
| --- | --- | --- |
| Exercise catalog | Yes | Yes |
| Workout calendar and local history | Yes | Yes |
| Calorie Balance dashboard | Yes | Yes |
| DataHive recipe catalog | Yes | Yes |
| USDA nutrition checks | Yes | Yes |
| Barcode and packaged-product lookup | Yes | Yes |
| Photo ingredient recognition | Hidden | Available after a verified key is saved |
| AI recipe generation | Hidden | Available after a verified key is saved |
| Adult AI energy calibration | No | Automatic when an eligible profile and key exist |
| Personalized two-week training | Hidden | Available to eligible adults after a verified key is saved |
| Provider-key settings | Hidden | Yes |

The build-time edition flag is `APP_EDITION=core` or `APP_EDITION=byok`. The Core API does not expose AI routes. The application never stores a model API key in source control, `.env`, Docker configuration, or server environment variables.

## 3. Navigation and global behavior

### 3.1 Primary navigation

The main navigation order is:

1. Exercises
2. Calendar
3. Balance
4. Recipes
5. Scan

Balance is the default screen. Selecting the Eat & Fit brand also opens Balance. Settings is a separate icon in the desktop header and is not part of the five-item primary navigation.

Desktop uses a translucent top header with centered navigation. Mobile uses a fixed bottom navigation bar with the same five destinations. Navigation resets destination-specific state where appropriate, including the Calendar date/mode and Scan mode.

### 3.2 Visual language

- Solid near-black forest background without a grid or cell texture.
- Lime-green `#B7FF4F` accent, off-white text, dark translucent cards, green borders/glow, and Manrope typography.
- Responsive cards, sheets, dialogs, grids, forms, and navigation.
- Standard action buttons use a dark appearance with green text/border and a brief green press flash. Destructive controls retain red styling.
- The brand uses the lime dumbbell mark, uppercase `EAT AND FIT`, and the dark `EF` favicon.
- English is the only supported UI and catalog language. There is no language selector or localization workflow.

### 3.3 Local dates and updates

Dates use the browser's local timezone and the `YYYY-MM-DD` storage format. Data-changing actions emit an in-browser change event so Balance and Calendar refresh without a page reload.

## 4. First launch and personal profile

### 4.1 Setup dialog

When the locally stored profile is incomplete, the application opens a small welcome form. The form can be completed or skipped for the current browser session. If it is skipped, it appears again in a future browser session until the profile is complete. The same profile can be edited later in Settings.

### 4.2 Profile fields and validation

| Field | Rule | Use |
| --- | --- | --- |
| Sex | Male or female | Selects matching exercise demonstrations and youth BMR equation |
| Age | Integer from 1 through 120 | Selects age-appropriate energy source and gates adult AI features |
| Weight | 2 through 400 kg | Used in energy calculations |
| Height | 40 through 250 cm | Included in adult AI personalization/calibration input |
| Training goal | Required only from age 19 | Used by personalized training and AI calibration |

Adult training-goal choices are:

- Lose weight
- Build muscle
- Stay fit

Age, weight, and height use one compact three-column row. The three adult training-goal choices also use one three-column row. Both layouts remain on one row at desktop and mobile widths.

### 4.3 Age gates

- Ages 1–5: the main app remains usable, but sourced exercise-energy estimates and AI training plans are unavailable.
- Ages 6–18: Youth Compendium estimates are available; AI calibration and personalized AI training are unavailable.
- Ages 19–59: Adult Compendium estimates, optional AI calibration, and personalized training are available.
- Ages 60–120: Older Adult Compendium estimates are preferred; optional AI calibration and personalized training are available.

Profile data is saved in browser `localStorage`. It is not included in JSON history backups.

## 5. Balance dashboard

### 5.1 Daily calculation

The dashboard uses the browser's current local date.

```text
eaten  = sum of positive calorie values from food entries for the day
burned = sum of positive caloriesBurned values from completed workouts for the day
balance = eaten - burned
```

Planned or partially completed workouts do not affect Balance. A completed workout with no available energy estimate contributes zero burned calories.

### 5.2 Display rules

- Food is displayed as a positive value.
- Burned exercise energy is displayed as a negative value, except zero is displayed without a sign.
- A positive balance means more calories were eaten than recorded as burned.
- A negative balance means recorded exercise energy exceeds recorded food energy.
- The balance number remains exact apart from display rounding to whole kcal.

### 5.3 Gauge

- Visual range: `+3,500 kcal` on the left, `0` in the center, and `−3,500 kcal` on the right.
- The arc is one continuous red-to-yellow-to-green gradient.
- The needle is clamped to the visual range; the numeric value is not clamped.
- Classification colors remain discrete for text and history:
  - Red: balance greater than `+500`.
  - Yellow: balance from `−500` through `+500`.
  - Green: balance lower than `−500`.

### 5.4 History and actions

The dashboard shows Eaten, Burned, Balance, and a seven-day chart for today plus the preceding six days. The Burned summary displays calories only. Chart bars are scaled relative to the largest absolute balance in the visible seven-day range.

`Add food` opens Recipes and returns to Balance after saving. `Add exercise` opens the exercise library and continues through the Calendar workflow.

## 6. Exercise library

### 6.1 Catalog

- 317 exercises in the generated browser catalog.
- 22 user-facing muscle groups.
- Source: `free-exercise-db-api`.
- Catalog records include name, body part, target, equipment, difficulty, compound/unilateral flags, descriptions, instructions, technique steps, form cues, common mistakes, breathing guidance, aliases, and available media.
- Male and female video/thumbnail variants are selected from the saved profile preference when available. A user can change the demonstration model inside an exercise detail; the choice is saved locally.

### 6.2 Browsing and search

The first Exercises view shows muscle cards. Opening a muscle shows its matching movements. Search is scoped to the opened group and matches exercise name, body part, target, equipment, and aliases, case-insensitively.

### 6.3 Exercise detail

The detail panel can show:

- Looping demonstration video and thumbnail.
- Body-part and difficulty badges.
- Description and instructions.
- Ordered technique steps.
- Form cues, common mistakes, and breathing guidance.
- Target, equipment, secondary-muscle approximation, compound status, and unilateral status.
- Male/female demonstration selection when that media exists.
- Workout-date selection and `Add to workout`.

Adding an exercise creates one planned set with 10 repetitions, 0 kg, and an incomplete status.

### 6.4 Personalized training entry point

`Personalized training program` is visible only in the BYOK edition when all of the following are true:

- The active AI provider has a saved, previously verified key.
- The profile is complete.
- Age is 19 or older.

## 7. Personalized two-week training

### 7.1 Generation inputs

The selected provider receives the adult profile, the goal already saved in that profile, and a reduced representation of all catalog exercises: ID, name, body part, target, equipment, and difficulty. Opening Personalized training immediately starts generation with the saved goal; the product does not ask the user to select the same goal again or show a separate `TWO-WEEK PROGRAM` step.

The AI must return:

- Exactly six sessions.
- Five through seven catalog exercises in each session.
- One through eight sets per exercise.
- Either 1–100 repetitions or an estimated 0.1–60 activity minutes per set.
- Only exercise IDs that exist in the local catalog.

Invalid provider output is rejected and nothing is saved.

### 7.2 Dates and review

Default dates are the next Monday, Wednesday, and Friday, repeated in the following week. The user can edit all six dates before confirmation.

Confirmation requires six different, non-past dates in chronological order. If any selected date already contains a workout, the user must confirm that the generated plan should be appended.

Every generated set starts at 0 kg. The plan is written to IndexedDB in one transaction and all workouts receive a shared `trainingPlanId`.

Before confirmation, the review screen shows estimated minutes and calories and can export the current dates and exercises as either CSV or human-readable TXT. Both exports include session number, selected date, session title, exercise, sets, reps, estimated minutes, starting weight, and estimated calories.

### 7.3 No provider fallback

The selected provider alone is used. A failed Meta request is not automatically sent to Gemini and a failed Gemini request is not automatically sent to Meta.

## 8. Calendar and local history

### 8.1 Calendar navigation

The Calendar has a month grid, previous/next month controls, an activity dot for dates containing a workout or food entry, and Workout/Nutrition tabs for the selected date.

### 8.2 Workout records

Each workout stores its exercise identity, date, notes, sets, completion status, optional frozen energy fields, and optional training-plan ID.

Each set supports:

- Repetitions: non-negative whole number.
- Weight: non-negative decimal value with a 0.5 kg input step.
- Activity time: displayed as positive decimal minutes. Storage remains seconds for backward-compatible workout and backup records.
- Done state.

Reps and Kg inputs permit an empty editing draft. Focusing an existing zero selects it so the first typed digit replaces it. Empty values normalize to zero on blur or Enter. Invalid edits keep the previous valid stored value. The Minutes input starts with a non-zero, source-profile estimate, selects its value on focus, accepts 0.1-minute steps, and converts the chosen value to seconds for storage.

A workout becomes completed only when it has at least one set and every set is marked done. Completing all sets freezes the current calories, duration, source, source URL, and energy-equivalent value into history. Reopening any set returns the workout to planned and removes those frozen fields. Previously completed history is not recalculated when the profile, model, or source registry changes.

Users can add sets, remove individual workouts, use `Remove today trainings` to remove incomplete workouts from the selected date, and move every incomplete workout dated today or later forward by one day. The two bulk operations require confirmation and run as atomic IndexedDB transactions. Completed workouts are not affected by either bulk operation.

Pressing a workout's exercise summary opens the existing full exercise detail view, including its demonstration, technique, form cues, common mistakes, breathing guidance, equipment, and muscle information. This Calendar detail view is read-only and does not show the scheduling controls.

### 8.3 Nutrition history

The Nutrition tab shows food entries for the selected date, daily calorie/protein/carbohydrate/fat totals, meal type, and saved image when present.

Users can add food through Recipes or add a packaged product through Scan. An existing food row can update its date, meal type, and stored quantity, or be removed. In the current implementation, editing the quantity field on an existing row does not recalculate its already stored nutrient totals.

Pressing a food summary opens a read-only detail sheet built from the payload stored with that Calendar entry. DataHive entries show recipe metadata, ingredients, labels, cautions, nutrition, and the source instruction link. AI entries show their description, preparation time, ingredients, steps, and saved nutrition. Scanned Open Food Facts and locally entered products show brand, barcode when available, nutrition basis, saved amount, saved nutrition, and the Open Food Facts source link when applicable.

## 9. Exercise-energy estimates

### 9.1 Source registry and exercise classification

The local registry version is `2024.1`. Every catalog exercise is deterministically assigned to one of nine profiles:

- Stretching
- Core
- General bodyweight
- Vigorous bodyweight
- Squat/deadlift
- General resistance
- Vigorous resistance
- Circuit
- Kettlebell

Classification uses exercise name, target, body part, equipment, difficulty, and compound status. The build/test suite verifies that all 317 exercises resolve to a traceable, age-compatible source entry.

Every resolved source records source name and URL, activity code and label, published value and unit, supported ages, reuse terms, registry version, and whether the mapping is exact or a closest-activity proxy.

### 9.2 Duration

Activity time is presented in minutes. Internally, the existing `durationSeconds` field remains the storage unit for backward compatibility. New and generated workouts receive a non-zero estimated set duration even without an AI-provided duration.

When no explicit duration exists, active time is derived from the local exercise-energy profile:

- 5 seconds per repetition: stretching, vigorous bodyweight, vigorous resistance, and kettlebell.
- 6 seconds per repetition: squat/deadlift.
- 4 seconds per repetition: core, general bodyweight, general resistance, and circuit.
- A minimum of 30 active seconds per set applies when repetitions would produce a shorter value.

Rest is then added between sets:

- 30 seconds: stretching, core, and circuit.
- 45 seconds: general bodyweight.
- 60 seconds: vigorous bodyweight, general resistance, and kettlebell.
- 90 seconds: squat/deadlift and vigorous resistance.

### 9.3 Age-specific formulas

For ages 19–59, Adult Compendium MET is used:

```text
kcal = MET × 3.5 × weightKg / 200 × minutes
```

For ages 60+, Older Adult `MET60+` is used:

```text
kcal = MET60+ × 2.7 × weightKg / 200 × minutes
```

For ages 6–18, Youth Compendium `METy` is selected for bands 6–9, 10–12, 13–15, or 16–18:

```text
kcal = METy × Schofield BMR kcal/min × minutes
```

Schofield equations use age band, sex, and weight. No sourced estimate is returned below age 6.

Harvard Health 30-minute values are implemented as an attributable interpolation/duration-scaling reference and regression check. Current catalog runtime estimates resolve through the age-appropriate Compendium registry because all exercises have a valid Compendium mapping.

### 9.4 Confidence labels

The UI labels an estimate as one of:

- Direct source
- Closest activity
- Derived estimate
- AI-personalized estimate

## 10. Optional adult AI energy calibration

When an adult has a complete profile and an active key in the BYOK edition, the app can calibrate local source-based estimates using five benchmark exercises:

- Barbell Back Squat
- Dumbbell Deadlift
- Barbell Bench Press
- Pull-Up / Chin-Up
- Military Press

Each benchmark uses three sets of ten repetitions. The provider receives the five baseline calories, durations, source codes, age, sex, weight, height, and training goal. It must return exactly five corrected calorie values.

Each correction is accepted only when it is 50–150% of its baseline. The arithmetic mean of the five corrected-to-baseline ratios becomes one personal factor, constrained to 0.5–1.5, which is applied after the source calculation.

The factor is cached in `localStorage`. Its fingerprint includes source-registry version, model-version identifier, provider, and all relevant profile fields. A profile, provider, model, or source-version change invalidates the cached factor. A failed calibration silently falls back to the unmodified source estimate. Calibration is unavailable below age 19 and never rewrites completed history.

## 11. Recipe catalog

### 11.1 Dataset and readiness

The production catalog contains exactly 39,447 DataHive `recipes-with-nutrition` records. The server refuses to mark the catalog healthy unless:

- SQLite opens read-only.
- `PRAGMA quick_check` succeeds.
- The recipe count is exactly 39,447.
- Metadata declares the same row count and the `datahive` provider.

### 11.2 Search and filters

- Default UI page size: 12; server maximum page size: 40.
- Text search uses normalized SQLite FTS prefix tokens and requires all query tokens.
- Ingredient handoff accepts up to 12 ingredient queries; a recipe may match any of the supplied ingredient queries.
- Cuisine, dish, meal, diet, and health filters use exact dataset labels.
- Minimum and maximum calories are per-serving filters and must be non-negative; minimum cannot exceed maximum.
- Filter choices and counts come from real dataset facets rather than hard-coded options.
- Results are ordered by title and stable recipe ID.
- Typing in the recipe search field requests up to five matching database recipes after a short debounce. The dropdown shows recipe title, source, calories, and image or fallback. Mouse/touch selection opens that recipe's detail directly; Arrow Up/Down, Enter, and Escape provide keyboard control. Submitting the search form still loads the normal paginated results.

### 11.3 Recipe detail and food handoff

Recipe cards show image fallback, classifications, source, calories, protein, and fat. Detail includes source link, ingredients, cuisine/dish/meal labels, diet and health labels, cautions, all available nutrients, and the external cooking-instructions URL.

Nutrition is stored per serving. When adding a recipe to Calendar, calories and macros are multiplied by the chosen serving count. The user also chooses date and meal type.

### 11.4 Import safety

The importer validates the exact CSV columns, required fields, numeric and JSON values, expected 39,447 rows, source SHA-256, and final SQLite integrity. It builds a temporary database and atomically replaces the production database only after validation. A failed import removes the temporary file and leaves the existing catalog untouched.

## 12. USDA nutrition

USDA FoodData Central data is imported into a local read-only SQLite service. The server supports both the normalized production schema and the compact/simple importer schema.

### 12.1 Search and food details

- Search uses normalized full-text prefix matching and returns up to 20 foods.
- Food detail includes FoodData Central ID, description, data type, nutrients per 100 g, and known portions with gram weights.
- The calculation endpoint accepts up to 100 `{fdcId, grams}` items and sums every available nutrient proportionally by grams.

### 12.2 AI-recipe nutrition check

The nutrition check walks through every generated recipe ingredient in order. For each ingredient, the user can:

- Edit the derived USDA search query.
- Select the closest USDA food.
- Confirm the gram amount used in the whole recipe.
- Skip the ingredient.

Ingredient text parsing understands common numeric, fractional, metric, imperial, size, and preparation prefixes. It uses a matching USDA portion when possible, explicit weight conversions when present, and otherwise proposes a deterministic default that the user must review.

After at least one ingredient is matched, all chosen ingredients are calculated together and divided by the generated recipe's serving count. The user can switch between the AI estimate and the USDA result before saving the food entry.

## 13. AI recipe generation

AI Recipes is available only in the BYOK edition with an active saved key. It can be opened from Recipes or from recognized ingredients on Scan.

### 13.1 Inputs

- Recipe idea or name.
- Required ingredients, including scanner handoff.
- Cuisine.
- Dish and meal type.
- Diet preferences.
- Excluded allergens and ingredients.
- Optional minimum/maximum calories, protein, carbohydrates, and fat.
- Maximum total time.
- Serving count.

Minimum nutrition values cannot exceed their corresponding maximum values. Serving count must be 1–20.

### 13.2 Output contract

The selected provider must return exactly two recipes. Each recipe requires a title, description, 1–20 servings, 1–720 minutes, 1–40 ingredients, 1–30 steps, and non-negative calories/protein/carbohydrates/fat per serving. Invalid or non-JSON output is rejected.

Users can inspect a generated recipe, run the USDA nutrition check, choose date/meal/servings, and save it to Calendar. AI values are always presented as estimates requiring review.

## 14. Scan tools

### 14.1 Photo ingredient recognition

Photo recognition is cloud-only and exists only in the BYOK edition after the active provider has a saved key. There is no on-device recognition mode and no UI switch for one.

The user can take a photo or choose one from the device. Before submission, the browser:

- Applies image orientation.
- Scales the longest dimension to at most 1,600 pixels.
- Converts to JPEG.
- Reduces JPEG quality toward the 1 MiB target.

The model is asked to identify only distinct edible ingredients visibly present. Output is limited to 30 English/Latin-name ingredients, each at most 80 characters. Names are whitespace-normalized, case-insensitively deduplicated, and shown for user review.

The user can edit, remove, and manually add ingredients, then either find matching catalog recipes or generate AI recipes. Multiple ingredients in one image are supported.

### 14.2 Barcode and packaged products

Barcode lookup is available in both editions. The screen starts the rear camera preview when browser permission allows and always provides numeric manual entry. The current lookup action uses an entered 8–14 digit barcode; automatic frame decoding is not implemented.

Lookup uses Open Food Facts and retrieves product name, brand, front image, and calories/protein/carbohydrates/fat per 100 g. If lookup fails, the user can enter a local product and its per-100-g nutrition manually.

The chosen gram amount scales all nutrient values linearly. The product can be saved as a Calendar food entry or handed to recipe search. Locally entered/saved products are retained in IndexedDB and included in history backups.

## 15. AI providers and keys

### 15.1 Providers and models

Exactly two providers are supported:

- Meta, using Muse Spark 1.3 (`muse-spark-1.3-contributor`, with `muse-spark-1.3` tried when the contributor model is reported missing).
- Google Gemini, using `gemini-3.1-flash-lite` by default.

The selected provider is shared by ingredient recognition, AI recipes, adult calibration, and personalized training. Recipe-generation configuration is not independently selectable in the UI.

There is no automatic cross-provider fallback.

### 15.2 Key verification and storage

Before a key is saved, the app performs one small provider request. Success displays `API key set`; authentication failure displays `Wrong API key`. A newly saved key becomes the active provider. A user can save both keys, select either configured provider, replace a key, or remove it.

Keys are encrypted with AES-GCM using a non-exportable, device-local 256-bit key. The encryption key and encrypted secrets are stored in the separate `eat-and-fit-secure-settings` IndexedDB database. Initialization vectors are random 12-byte values. Keys are not included in backups or analytics.

Meta ingredient, recipe, training, and calibration requests are made directly from the browser. Gemini AI requests are sent through the same-origin Eat & Fit API, which forwards the supplied key for that request. Key verification is also performed through the API. The application server does not persist request keys or submitted content.

Removing or switching a key updates AI-dependent UI immediately. If no active key exists, Smart Scan defaults to barcode-only behavior and AI controls are hidden or direct the user to Settings.

## 16. Settings

Settings contains:

- Personal profile editing.
- BYOK-only Meta and Gemini key fields, saved status, removal, and active-provider selection.
- JSON history export.
- JSON history import.
- Deletion of locally stored workouts, food, and products.
- A collapsed `Legal, data sources & safety` disclosure.

The legal disclosure attributes and links the exercise catalog, Adult/Older Adult/Youth Compendia, Harvard reference table, DataHive recipe data, USDA FoodData Central, and Open Food Facts. It also states the DataHive non-commercial restriction, external-media ownership limits, AI review requirement, and educational/not-medical-advice safety warning.

## 17. Local storage, backup, and deletion

### 17.1 Main IndexedDB database

Database: `eat-and-fit`, schema version 1.

Object stores:

- `workouts`, keyed by workout ID.
- `food`, keyed by food-entry ID.
- `products`, keyed by barcode.

### 17.2 Other browser storage

- Profile, exercise-demonstration preference, and AI calibration: `localStorage`.
- Welcome-dialog skip state: `sessionStorage`.
- Encrypted AI keys and active provider: separate secure-settings IndexedDB database.

### 17.3 Backup scope

JSON backups use `schemaVersion: 1` and contain export time, workouts, food entries, and saved products. They intentionally exclude:

- AI keys and encryption key.
- Active AI-provider preference.
- Personal profile.
- Exercise-demonstration preference.
- Cached AI calibration.
- Welcome-dialog session state.

Import validates the top-level schema version and array presence, clears the existing three history stores, and then restores their records. `Delete local history` clears those same three stores; it does not delete profile or encrypted AI settings.

## 18. Backend API contract

### 18.1 Catalog and nutrition routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/recipes/healthz` | DataHive readiness and exact count |
| GET | `/api/recipes` | Paginated recipe search, filters, and facets |
| GET | `/api/recipes/:id` | Full recipe details |
| GET | `/api/nutrition/healthz` | USDA readiness, schema, and counts |
| GET | `/api/nutrition/search?q=` | USDA food search |
| GET | `/api/nutrition/foods/:fdcId` | Food nutrients and portions |
| POST | `/api/nutrition/calculate` | Multi-ingredient nutrient totals |
| GET | `/api/products/:barcode` | Open Food Facts lookup |

### 18.2 BYOK-only AI routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/ai/ingredients/healthz` | Supported recognition providers |
| POST | `/api/ai/ingredients/detect` | Server-side recognition path used by Gemini |
| GET | `/api/ai/recipes/healthz` | Supported recipe providers |
| POST | `/api/ai/recipes/generate` | Server-side recipe path used by Gemini |
| POST | `/api/ai/training/generate` | Server-side training path used by Gemini |
| POST | `/api/ai/training/calibrate` | Server-side calibration path used by Gemini |
| POST | `/api/ai/keys/verify` | One-request provider-key verification |

AI requests authenticate with the user-supplied key in a Bearer header and select the provider with `x-recognition-provider`. The API accepts only Meta or Gemini. Provider timeouts, authentication, billing, authorization, missing-model, rate-limit, content-policy, and invalid-response conditions are converted into user-readable errors.

## 19. Data sources and licenses

- Exercise catalog: [free-exercise-db-api](https://github.com/luisaraujoc/free-exercise-db-api), declared MIT license. External video/image rights require separate confirmation for commercial reuse.
- Recipe catalog: [DataHive recipes-with-nutrition](https://huggingface.co/datasets/datahiveai/recipes-with-nutrition), CC BY-NC 4.0. The 39,447-record catalog is restricted to non-commercial use; linked pages and remote images can have separate owners and terms.
- Nutrition: [USDA FoodData Central](https://fdc.nal.usda.gov/), public-domain data published under CC0 1.0.
- Products: [Open Food Facts](https://world.openfoodfacts.org/terms-of-use), subject to its database terms and possible incompleteness.
- Adult energy: [2024 Adult Compendium of Physical Activities](https://pacompendium.com/conditioning-exercise/).
- Older-adult energy: [Older Adult Compendium](https://pacompendium.com/older-adult-compendium/).
- Youth energy: [Youth Compendium of Physical Activities](https://www.nccor.org/tools-youthcompendium/met-view-by-individual-category/), including published Schofield equations.
- Reference validation: [Harvard Health calories burned in 30 minutes](https://www.health.harvard.edu/diet-and-weight-loss/calories-burned-in-30-minutes-for-people-of-three-different-weights).

## 20. Analytics, privacy, and security boundaries

- Optional Firebase Analytics initializes only when all required public Firebase configuration values are present and the browser supports analytics.
- AI keys are excluded from Firebase initialization and application backups.
- The application does not provide accounts, remote history storage, cloud sync, or multi-device key synchronization.
- Local encryption protects saved keys at rest but cannot protect an unlocked browser, compromised device, malicious extension, or compromised application origin.
- Remote recipe images and source links contact their respective external hosts when loaded or opened.
- Camera access is limited by the deployed Permissions Policy to the application origin.
- The web container and API container use read-only filesystems, temporary writable directories, dropped Linux capabilities, and same-origin API proxying.
- Nginx adds `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a camera Permissions Policy. API request bodies through Nginx are limited to 2 MiB.

## 21. Deployment and operations

The production topology is:

```text
Browser -> Nginx web container -> Node API container
                              -> read-only recipe SQLite volume
                              -> read-only USDA SQLite volume
                              -> external Meta/Gemini/Open Food Facts services when requested
```

Docker Compose provides separate import jobs for recipe and USDA data. Runtime containers do not require the original CSV files. Recipe and nutrition databases live in named volumes so application image replacement does not delete catalog data.

Web health is available at `/healthz`. Recipe and nutrition services have the API health routes listed above. The production recipe service is healthy only at exactly 39,447 records.

## 22. Verification requirements

Changes should be verified in proportion to their scope. The standard full verification is:

```bash
python3 scripts/validate_exercise_catalog.py
npm test
npm run typecheck
npm run build
npm run build:byok
docker compose config
```

Feature tests cover provider selection and validation, scanner behavior, secure-key encryption, recipe and USDA calculations, profile boundaries, exercise-energy formulas and provenance, calibration limits, training-plan validation, Calendar numeric editing and bulk operations, Balance calculations and gauge behavior, backup validation, legal content, and core/BYOK design visibility.

## 23. Explicit non-features and current limitations

- No accounts, login, cloud sync, or shared profiles.
- No localization; English only.
- No on-device ingredient recognition.
- No automatic cross-provider AI fallback.
- No automatic barcode decoding from live video frames; lookup currently uses entered barcode digits.
- No medical diagnosis, clinical nutrition plan, or guaranteed weight-loss prediction.
- No automatic meal plan or calorie target.
- No body-weight history or macro targets.
- No manual generic activity entry.
- No video technique analysis, repetition counting, live form-error alerts, or rest timer yet.
- Backups do not include profile, AI keys, provider preference, or calibration.
- Editing the quantity of an already saved food row does not currently recompute its stored nutrients.
