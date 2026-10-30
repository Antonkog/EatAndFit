# Eat & Fit

Eat & Fit is an English-language, mobile-first workout and nutrition app. It combines a 317-exercise video library, age-aware exercise-energy estimates, a local workout calendar, 39,447 searchable recipes, USDA nutrition calculations, and packaged-food lookup.

Workout and meal history is stored in the browser. There are no user accounts or cloud sync. Settings provides JSON export/import and complete deletion of local history.

## Free editions

- **Core** contains every feature that does not require a private model API key. Barcode lookup remains available, while the ingredient-recognition and AI-recipe controls are hidden.
- **BYOK AI** adds photo ingredient recognition, AI recipe generation, conservative adult energy calibration, and personalized two-week training plans. The user stores either a Meta or Google Gemini key in Settings and chooses the active provider. A key is checked once before it is encrypted and saved. Saving or removing a key updates the available UI immediately. There is no automatic provider fallback.

BYOK keys are encrypted with AES-GCM using a non-exportable device-local key and stored in browser IndexedDB. They are excluded from backups and analytics. Meta requests go from the browser to Meta; Gemini requests are forwarded over HTTPS for that request. Eat & Fit does not persist the key or submitted content. Local encryption protects keys at rest, but it cannot protect an unlocked browser, compromised device, or compromised application origin.

Profiles are also local. Ages 6–18 use Youth Compendium estimates, ages 19–59 use Adult Compendium MET values, and ages 60+ prefer Older Adult MET60+ values. Ages 1–5 do not receive sourced calorie estimates. Completed exercise energy is frozen into workout history; reopening a set clears that completed estimate. Energy-equivalent weight is a rough comparison (`kcal ÷ 7,700`), not guaranteed weight loss.

## Local development

Requires Node.js 24+, Python 3.12+, and the separately obtained DataHive and USDA source files.

```bash
npm install
cp .env.example .env
python3 recipe-import/import_recipes.py /path/to/recipes.csv data/recipes.sqlite
python3 nutrition-import/import_usda.py /path/to/usda-csv data/nutrition.sqlite
npm run api
npm run dev
```

Use `npm run api` with `npm run dev` for Core. For BYOK AI, run `npm run api:byok` with `npm run dev:byok`. The Core API does not expose AI routes. No model API key belongs in `.env`, Docker configuration, source files, or server environment variables.

Build one edition or both:

```bash
npm run build          # Core -> dist/
npm run build:byok     # BYOK -> dist/
npm run build:editions # Core -> dist/core, BYOK -> dist/byok
```

Docker defaults to Core. Select BYOK at build time with the non-secret edition flag:

```bash
APP_EDITION=byok docker compose up -d --build api web
```

Firebase Analytics is optional and remains disabled when its public configuration is absent.

## Verification

```bash
python3 scripts/validate_exercise_catalog.py
npm test
npm run typecheck
npm run build
npm run build:byok
docker compose config
```

For containers, first import the external datasets with `docker compose --profile import run --rm recipe-import` and `nutrition-import`, then start the application with `docker compose up -d --build api web`.

## Legal and safety

- Exercise data and demonstrations are attributed to [free-exercise-db-api](https://github.com/luisaraujoc/free-exercise-db-api), which declares an MIT license. Confirm the rights to externally hosted media separately before commercial reuse.
- The [DataHive recipes-with-nutrition dataset](https://huggingface.co/datasets/datahiveai/recipes-with-nutrition) is licensed CC BY-NC 4.0. Its 39,447 recipes are used only for this non-commercial project. Linked source pages and images can have separate owners and terms.
- [USDA FoodData Central](https://fdc.nal.usda.gov/) data is public domain and published under CC0 1.0.
- Packaged-product data comes from [Open Food Facts](https://world.openfoodfacts.org/terms-of-use) and can be incomplete or outdated.
- Adult estimates cite the [2024 Adult Compendium of Physical Activities](https://pacompendium.com/conditioning-exercise/); estimates for ages 60+ prefer the [Older Adult Compendium](https://pacompendium.com/older-adult-compendium/).
- Estimates for ages 6–18 cite the [Youth Compendium of Physical Activities](https://www.nccor.org/tools-youthcompendium/met-view-by-individual-category/) and its published Schofield equations. [Harvard Health’s 30-minute table](https://www.health.harvard.edu/diet-and-weight-loss/calories-burned-in-30-minutes-for-people-of-three-different-weights) provides a fallback/reference check with weight interpolation and duration scaling.
- In the BYOK edition, ingredient recognition, AI recipe generation, adult energy calibration, and personalized training are billed under the user-supplied Meta or Google Gemini key. Submitted content and the selected key are transmitted for processing; Eat & Fit does not persist them. Generated results require review.
- Exercise and nutrition information is educational and not medical advice. Stop exercising if you experience pain and consult a qualified professional when appropriate.

Source datasets, downloaded media, credentials, environment files, and generated SQLite databases are intentionally excluded from Git.
