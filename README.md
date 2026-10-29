# Eat & Fit

Eat & Fit is an English-language, mobile-first workout and nutrition app. It combines a 317-exercise video library, a local workout calendar, 39,447 searchable recipes, USDA nutrition calculations, and packaged-food lookup.

Workout and meal history is stored in the browser. There are no user accounts or cloud sync. Settings provides JSON export/import and complete deletion of local history.

## Free editions

- **Core** contains every feature that does not require a private model API key. Barcode lookup remains available, while the ingredient-recognition and AI-recipe controls are hidden.
- **BYOK AI** adds photo ingredient recognition and AI recipe generation. The user stores either a Meta or Google Gemini key in Settings and chooses the active provider. Saving or removing a key updates the available UI immediately. There is no automatic provider fallback.

BYOK keys are encrypted with AES-GCM using a non-exportable device-local key and stored in browser IndexedDB. They are excluded from backups and analytics. For an AI request, the browser decrypts the selected key and sends it with the submitted content over HTTPS to the Eat & Fit API. The API forwards both to the selected provider for that request and does not persist either value. This protects keys at rest, but it cannot protect an unlocked browser, compromised device, or compromised application origin.

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
- In the BYOK edition, ingredient recognition and AI recipe generation are billed under the user-supplied Meta or Google Gemini key. Submitted content and the selected key are transmitted for processing; Eat & Fit does not persist them. Generated results require review.
- Exercise and nutrition information is educational and not medical advice. Stop exercising if you experience pain and consult a qualified professional when appropriate.

Source datasets, downloaded media, credentials, environment files, and generated SQLite databases are intentionally excluded from Git.
