# Eat & Fit Product Specifications

## Document status

- Product: Eat & Fit web application
- Specification version: 1.6
- Implementation baseline: `develop` as of October 31, 2026
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
| Local camera-guided exercise sessions | Yes | Yes |
| Post-set SAM/Muse movement coaching | Hidden | Available to adults with a verified Meta key and separate per-rep consent |
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
- The brand uses the lime rounded-square dumbbell mark in the header, Exercises navigation, and browser-tab favicon, with uppercase `EAT AND FIT` in the header.
- English is the only supported UI and catalog language. There is no language selector or localization workflow.

### 3.3 Local dates and updates

Dates use the browser's local timezone and the `YYYY-MM-DD` storage format. Data-changing actions emit an in-browser change event so Balance and Calendar refresh without a page reload.

### 3.4 Numeric input behavior

When any enabled, editable number input contains exactly zero, focusing or tapping it selects the complete zero. The first typed digit replaces the zero instead of producing values such as `01` or `02`. Mobile pointer placement reselects zero after the native caret update. Empty-draft and field-specific validation rules remain unchanged, and nonzero values are not automatically selected.

## 4. First launch and personal profile

### 4.1 Setup dialog

When the locally stored profile is incomplete, the application opens a small welcome form. Choosing `Not now` stores the dismissal time locally. The application checks only when a page is loaded and opens the form again when at least two hours have elapsed. Saving a complete profile clears the dismissal time. The same profile can be edited later in Settings.

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

The action panel is headed `Update your balance`; it does not repeat a separate `Log today` eyebrow.

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
- Either 1–100 repetitions or an estimated 1–60 whole activity minutes per set.
- Only exercise IDs that exist in the local catalog.

Invalid provider output is rejected and nothing is saved.

### 7.2 Dates and review

Default dates are the next Monday, Wednesday, and Friday, repeated in the following week. The user can edit all six dates before confirmation.

Confirmation requires six different, non-past dates in chronological order. If any selected date already contains a workout, the user must confirm that the generated plan should be appended.

Every generated set starts at 0 kg for later Calendar editing, but zero weight is not shown in the plan review or exports. AI-provided durations must be whole minutes. Repetition-based durations are rounded upward to at least one whole minute per set before storage. The plan is written to IndexedDB in one transaction and all workouts receive a shared `trainingPlanId`.

Before confirmation, the review screen shows whole per-exercise minutes plus the combined whole session duration and calories. It can export the current dates and exercises as either CSV or human-readable TXT. Both exports include session number, selected date, session title, exercise, sets, reps, whole estimated minutes, and estimated calories. They omit the always-zero starting weight.

### 7.3 No provider fallback

The selected provider alone is used. A failed Meta request is not automatically sent to Gemini and a failed Gemini request is not automatically sent to Meta.

## 8. Calendar and local history

### 8.1 Calendar navigation

The Calendar has a month grid, previous/next month controls, an activity dot for dates containing a workout or food entry, and Workout/Nutrition tabs for the selected date.

### 8.2 Workout records

Each workout stores its exercise identity, date, notes, sets, completion status, optional frozen energy fields, and optional training-plan ID.

Each set uses the visible columns `Set`, `Reps`, `Weight (kg)`, `Time (min)`, and `Done`. It supports:

- Repetitions: non-negative whole number.
- Weight: non-negative decimal value with a 0.5 kg input step.
- Activity time: displayed as positive decimal minutes. Storage remains seconds for backward-compatible workout and backup records.
- Done state.

Reps and Kg inputs permit an empty editing draft. Focusing an existing zero selects it so the first typed digit replaces it. Empty values normalize to zero on blur or Enter. Invalid edits keep the previous valid stored value. The Minutes input starts with a non-zero, source-profile estimate, selects its value on focus, accepts 0.1-minute steps, and converts the chosen value to seconds for storage.

A workout becomes completed only when it has at least one set and every set is marked done. Completing all sets freezes the current calories, duration, source, source URL, and energy-equivalent value into history. Reopening any set returns the workout to planned and removes those frozen fields. Previously completed history is not recalculated when the profile, model, or source registry changes.

Users can add sets or remove individual workouts. `Edit training` opens bulk controls for the selected Calendar date: move its incomplete workouts to another non-past date, move every incomplete workout on or after the selected date forward by one day, or remove all incomplete workouts on the selected date. The wording uses `today` only when today is selected. Destination conflicts require confirmation, and every bulk operation runs as one atomic IndexedDB transaction. Completed workouts are never affected.

Pressing a workout's exercise summary opens the existing full exercise detail view, including its demonstration, technique, form cues, common mistakes, breathing guidance, equipment, and muscle information. This Calendar detail view is read-only and does not show the scheduling controls.

### 8.3 Camera-guided exercise sessions

An incomplete workout scheduled for the current day displays `Start exercise`. The first release has versioned camera profiles for Barbell Back Squat, Dumbbell Deadlift, Barbell Bench Press, Pull-Up / Chin-Up, Military Press, bodyweight Squat, Push-Up, and Jumping Jack. Other exercises use the same whole-set timer workflow.

After explicit camera permission, a self-hosted MediaPipe Pose Landmarker runs in a dedicated browser worker at approximately 10–12 analyzed frames per second. It draws the live 33-landmark skeleton, applies deterministic start/peak/return state machines, and owns the repetition count. A valid transition requires five consecutive frames with at least 0.6 landmark visibility, a repetition duration of 0.8–8 seconds, and 0.7 seconds of duplicate protection. Users can undo the last count or add a missed repetition.

Camera denial, unavailable tracking, an unsupported exercise, or the user choosing `Use timer instead` starts a complete-set timer. The user explicitly confirms completion after the timer. Both modes mark the set locally, preserve backward compatibility through optional set fields, and start a skippable 60-second rest period. Only fully completed workouts freeze calories and affect Balance.

The local assessment has exactly three states: `good_form`, `correction_needed`, or `insufficient_evidence`. A counted repetition can still be identified as shallow because the counting threshold is intentionally broader than the good-form threshold. Correct execution receives positive confirmation with no fabricated correction. Low-confidence evidence receives camera-position guidance and no positive or negative technique judgment.

When one set needs correction, the next set is compared with the previous primary measurement. Reaching the good-form threshold—or moving the primary measurement in the correct direction—shows a deterministic `Improvement verified` result.

### 8.4 Optional Meta movement analysis

In the BYOK edition, an adult with a separately verified Meta key can choose `Analyze rep N with Meta` after a camera-counted set. Meta movement analysis is independent of the provider selected for recipes or scanning. The action requests a second, per-repetition consent; it never uploads automatically.

The browser records the set in memory without audio. Eat & Fit selects a locally measured questionable repetition first, otherwise a representative successful repetition. The server trims only that 0.8–12-second window in tmpfs, removes audio, converts it to H.264 MP4 at no more than 720p and 12 FPS, and uploads it through the Meta Files API. SAM 3.1 provides a real person track rendered as a replay box. Multiple-person or missing-person results are rejected. Muse Spark 1.3 receives the same clip and the authoritative local assessment, and returns structured coaching.

Muse cannot change the application-selected status or create numerical measurements. Good form requires a positive observation and a null correction. A correction state requires exactly one evidence-grounded correction. Insufficient evidence permits no technique judgment. Contradictory output is rejected. Local and Meta files are deleted on both success and failure paths; raw video, landmarks, and SAM output are not stored in IndexedDB or backups. Meta failure never removes local workout progress.

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

Harvard Health 30-minute values are implemented as an attributable interpolation/duration-scaling reference and regression check. Current catalog runtime estimates resolve through the age-appropriate Compendium registry because all exercises have a valid Compendium mapping. Session totals sum the exact per-exercise durations and calories before display rounding; valid estimates are not inflated merely because they appear low.

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

### 11.3 Daily localized suggestions

When Recipes opens with no submitted search, typed query, ingredient handoff, or active filter, the first three positions in the existing recipe grid are daily catalog suggestions:

- Morning: a healthy breakfast or brunch with 150–500 kcal, no more than 10 ingredients, and no more than 20 g fat. Dessert/alcohol dish labels and obvious dessert/cocktail title terms are excluded.
- Afternoon: a healthy lunch/dinner main course with 250–600 kcal, at least 20 g protein, no more than 12 ingredients, and chicken, turkey, beef, pork, lamb, veal, or duck.
- Evening: a healthy lunch/dinner main course, soup, or salad with 200–550 kcal, at least 12 g protein, no more than 10 ingredients, and no more than 25 g fat.

Strict suggestions require one of the DataHive diet labels Balanced, High-Fiber, High-Protein, Low-Fat, or Low-Sodium. The service prefers the mapped local cuisine, then the same strict criteria across the catalog, then relaxes diet-label, ingredient-count, protein, and fat constraints while retaining meal role and calorie bounds. Suggestions are unique and identified by Morning/Afternoon/Evening badges.

Selection is deterministic from the browser-local date, mapped cuisine, refresh variation, meal role, and stable recipe ID. `Refresh suggestions` advances the variation. Recommended IDs are excluded from the remaining results so pagination contains every catalog recipe exactly once. Opening a suggestion uses the normal detail view and defaults its Calendar meal selector to breakfast, lunch, or dinner for the suggestion role. Search, filters, autocomplete, and ingredient handoff use normal catalog ordering without suggestion injection.

The web server forwards the client address to the internal API. The API sends a public client IP to Country.is for a country code, maps it to an existing DataHive cuisine, and returns only country code, cuisine, and resolution source. Georgia maps to `middle eastern`. Private addresses and failed lookups fall back to the `Accept-Language` country, then `world`. The browser caches only the returned country/cuisine result for 24 hours; Eat & Fit does not persist the raw IP.

### 11.4 Recipe detail and food handoff

Recipe cards show image fallback, classifications, source, calories, protein, and fat. Detail includes source link, ingredients, cuisine/dish/meal labels, diet and health labels, cautions, all available nutrients, and the external cooking-instructions URL.

Nutrition is stored per serving. When adding a recipe to Calendar, calories and macros are multiplied by the chosen serving count. The user also chooses date and meal type.

### 11.5 Import safety

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

Barcode lookup is available in both editions. On HTTPS or localhost, the screen dynamically loads the ZXing browser decoder and scans the rear-camera stream for EAN-8, EAN-13, UPC-A, UPC-E, and ITF/GTIN-14 codes. The first valid 8–14 digit result stops the camera, optionally vibrates the device, and automatically starts product lookup. Duplicate frame results are ignored.

Camera tracks are stopped when the scanner is left, hidden, reset, or replaced by a product result. `Scan another product` starts a fresh decoding session. Permission, browser-support, decoder, or secure-context failures show a retry action while numeric manual entry remains available.

Lookup uses Open Food Facts and retrieves product name, brand, front image, and calories/protein/carbohydrates/fat per 100 g. If lookup fails, the user can enter a local product and its per-100-g nutrition manually.

The chosen gram amount scales all nutrient values linearly. The product can be saved as a Calendar food entry or handed to recipe search. Locally entered/saved products are retained in IndexedDB and included in history backups.

## 15. AI providers and keys

### 15.1 Providers and models

Exactly two providers are supported:

- Meta, using Muse Spark 1.3 (`muse-spark-1.3-contributor`, with `muse-spark-1.3` tried when the contributor model is reported missing).
- Google Gemini, using `gemini-3.1-flash-lite` by default.

The selected provider is shared by ingredient recognition, AI recipes, adult calibration, and personalized training. Recipe-generation configuration is not independently selectable in the UI. Optional movement analysis always uses a separately saved Meta key and remains available when Gemini is selected for the other AI features.

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

The legal disclosure attributes and links the exercise catalog, Adult/Older Adult/Youth Compendia, Harvard reference table, DataHive recipe data, Country.is, USDA FoodData Central, and Open Food Facts. It also states the DataHive non-commercial restriction, cuisine-location privacy behavior, external-media ownership limits, AI review requirement, and educational/not-medical-advice safety warning.

## 17. Local storage, backup, and deletion

### 17.1 Main IndexedDB database

Database: `eat-and-fit`, schema version 1.

Object stores:

- `workouts`, keyed by workout ID.
- `food`, keyed by food-entry ID.
- `products`, keyed by barcode.

### 17.2 Other browser storage

- Profile, exercise-demonstration preference, AI calibration, welcome-dialog dismissal timestamp, and cached country/cuisine result: `localStorage`.
- Encrypted AI keys and active provider: separate secure-settings IndexedDB database.

### 17.3 Backup scope

JSON backups use `schemaVersion: 1` and contain export time, workouts, food entries, and saved products. They intentionally exclude:

- AI keys and encryption key.
- Active AI-provider preference.
- Personal profile.
- Exercise-demonstration preference.
- Cached AI calibration.
- Welcome-dialog dismissal timestamp and cached cuisine location.

Import validates the top-level schema version and array presence, clears the existing three history stores, and then restores their records. `Delete local history` clears those same three stores; it does not delete profile or encrypted AI settings.

## 18. Backend API contract

### 18.1 Catalog and nutrition routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/recipes/healthz` | DataHive readiness and exact count |
| GET | `/api/recipes` | Paginated recipe search, filters, and facets |
| GET | `/api/recipes/:id` | Full recipe details |
| GET | `/api/location/cuisine` | Country-only cuisine preference with language/world fallback |
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
| POST | `/api/ai/movement/analyze` | Temporary selected-rep SAM 3.1 tracking and Muse Spark 1.3 coaching with a Meta key |
| POST | `/api/ai/keys/verify` | One-request provider-key verification |

AI requests authenticate with the user-supplied key in a Bearer header and select the provider with `x-recognition-provider`. The API accepts only Meta or Gemini. Provider timeouts, authentication, billing, authorization, missing-model, rate-limit, content-policy, and invalid-response conditions are converted into user-readable errors.

## 19. Data sources and licenses

- Exercise catalog: [free-exercise-db-api](https://github.com/luisaraujoc/free-exercise-db-api), declared MIT license. External video/image rights require separate confirmation for commercial reuse.
- Recipe catalog: [DataHive recipes-with-nutrition](https://huggingface.co/datasets/datahiveai/recipes-with-nutrition), CC BY-NC 4.0. The 39,447-record catalog is restricted to non-commercial use; linked pages and remote images can have separate owners and terms.
- Cuisine location: [Country.is](https://country.is/), using GeoLite2 country data. A public visitor IP is submitted for country resolution and is not stored by Eat & Fit.
- Nutrition: [USDA FoodData Central](https://fdc.nal.usda.gov/), public-domain data published under CC0 1.0.
- Products: [Open Food Facts](https://world.openfoodfacts.org/terms-of-use), subject to its database terms and possible incompleteness.
- Adult energy: [2024 Adult Compendium of Physical Activities](https://pacompendium.com/conditioning-exercise/).
- Older-adult energy: [Older Adult Compendium](https://pacompendium.com/older-adult-compendium/).
- Youth energy: [Youth Compendium of Physical Activities](https://www.nccor.org/tools-youthcompendium/met-view-by-individual-category/), including published Schofield equations.
- Reference validation: [Harvard Health calories burned in 30 minutes](https://www.health.harvard.edu/diet-and-weight-loss/calories-burned-in-30-minutes-for-people-of-three-different-weights).
- Local movement landmarks: [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker), with pinned WASM and model assets self-hosted by Eat & Fit.
- Optional Meta movement evidence: [SAM 3.1](https://dev.meta.ai/docs/sam/overview) and [Muse Spark 1.3 video understanding](https://dev.meta.ai/docs/video-understanding), subject to Meta API and hackathon promotional-credit terms.

## 20. Analytics, privacy, and security boundaries

- Optional Firebase Analytics initializes only when all required public Firebase configuration values are present and the browser supports analytics.
- AI keys are excluded from Firebase initialization and application backups.
- The application does not provide accounts, remote history storage, cloud sync, or multi-device key synchronization.
- Local encryption protects saved keys at rest but cannot protect an unlocked browser, compromised device, malicious extension, or compromised application origin.
- Remote recipe images and source links contact their respective external hosts when loaded or opened.
- Opening the unfiltered Recipes screen can submit the visitor IP to Country.is for country-only cuisine localization. Eat & Fit stores neither the raw address nor precise location.
- Camera access is limited by the deployed Permissions Policy to the application origin.
- Live movement video and body landmarks stay in browser memory until separate analysis consent. After consent, the temporary full-set recording passes through Eat & Fit only to trim the selected window; only the selected muted repetition is sent to Meta. Temporary server and provider files are deleted after analysis.
- The web container and API container use read-only filesystems, temporary writable directories, dropped Linux capabilities, and same-origin API proxying.
- Nginx adds `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a camera Permissions Policy. General API request bodies are limited to 2 MiB; the movement-analysis route alone allows 32 MiB for its validated 30 MiB video limit.

## 21. Deployment and operations

### 21.1 Installable web app

Eat & Fit is an installable Progressive Web App in both editions. The web manifest uses the product name, lime dumbbell icons, dark theme colors, root scope, and `standalone` display mode. Apple Home Screen metadata supplies the matching touch icon, title, black status bar, and standalone launch behavior.

On mobile, the installed standalone app keeps its header and bottom navigation outside the page's internal scrolling region. This prevents navigation drift during iOS PWA scrolling while preserving the normal browser layout and its toolbar-aware fixed navigation behavior.

Settings contains `Install Eat & Fit`. On iPhone and iPad it explains the Safari Share → Add to Home Screen flow. Browsers that provide `beforeinstallprompt` expose a direct install button. When launched from its Home Screen icon, Eat & Fit runs without Safari’s address field or bottom website bar. Browser chrome remains visible during ordinary website browsing because a page cannot hide browser-owned controls.

A versioned service worker caches the application shell and same-origin static assets for faster repeat launches and basic offline navigation. API requests, Meta/Gemini requests, Open Food Facts data, recipe search, and other network-backed operations are never served from that cache and still require connectivity. Existing profile, API-key, workout, meal, and product storage remains in the browser’s local IndexedDB/local storage.

### 21.2 Containers and health

The production topology is:

```text
Browser -> Nginx web container -> Node API container
                              -> read-only recipe SQLite volume
                              -> read-only USDA SQLite volume
                              -> external Country.is/Meta/Gemini/Open Food Facts services when requested
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

Feature tests cover provider selection and validation, scanner behavior, secure-key encryption, recipe recommendations/search and USDA calculations, profile reminder boundaries, global numeric-zero replacement, exercise-energy formulas and provenance, calibration limits, training-plan validation, Calendar numeric editing and bulk operations, Balance calculations and gauge behavior, backup validation, legal content, favicon branding, and core/BYOK design visibility.

## 23. Explicit non-features and current limitations

- No accounts, login, cloud sync, or shared profiles.
- No localization; English only.
- No on-device ingredient recognition.
- No automatic cross-provider AI fallback.
- No medical diagnosis, clinical nutrition plan, or guaranteed weight-loss prediction.
- No automatically saved meal plan or calorie target; localized recipes are optional catalog suggestions only.
- No body-weight history or macro targets.
- No manual generic activity entry.
- No video technique analysis, repetition counting, live form-error alerts, or rest timer yet.
- Backups do not include profile, AI keys, provider preference, or calibration.
- Editing the quantity of an already saved food row does not currently recompute its stored nutrients.
