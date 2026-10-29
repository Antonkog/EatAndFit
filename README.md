# Eat & Fit

Eat & Fit is an English-language, mobile-first workout and nutrition app. It combines a 317-exercise video library, a local workout calendar, 39,447 searchable recipes, USDA nutrition calculations, AI recipe generation, photo ingredient recognition, and packaged-food lookup.

Workout and meal history is stored in the browser. There are no user accounts or cloud sync. Settings provides JSON export/import and complete deletion of local history.

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

Recipe generation and ingredient recognition use separate server-only configurations. Configure recipe generation with `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY`.

Ingredient recognition defaults to Meta and supports exactly two providers:

```ini
RECOGNITION_MODEL_PROVIDER=META
META_MODEL_API_KEY=replace-me
META_RECOGNITION_MODEL=muse-spark-1.3
META_MODEL_API_BASE_URL=https://api.meta.ai/v1
RECOGNITION_TIMEOUT_MS=45000
```

To retain the Gemini scanner instead, switch the selector and provide its key:

```ini
RECOGNITION_MODEL_PROVIDER=GEMINI
GEMINI_API_KEY=replace-me
GEMINI_VISION_MODEL=gemini-3.1-flash-lite
```

The server creates only the selected recognition provider. It never retries a failed recognition request with the other provider. Keys remain on the server and must never use a `VITE_` prefix. Firebase Analytics is optional and remains disabled when its public configuration is absent.

## Verification

```bash
python3 scripts/validate_exercise_catalog.py
npm test
npm run typecheck
npm run build
docker compose config
```

For containers, first import the external datasets with `docker compose --profile import run --rm recipe-import` and `nutrition-import`, then start the application with `docker compose up -d --build api web`.

## Legal and safety

- Exercise data and demonstrations are attributed to [free-exercise-db-api](https://github.com/luisaraujoc/free-exercise-db-api), which declares an MIT license. Confirm the rights to externally hosted media separately before commercial reuse.
- The [DataHive recipes-with-nutrition dataset](https://huggingface.co/datasets/datahiveai/recipes-with-nutrition) is licensed CC BY-NC 4.0. Its 39,447 recipes are used only for this non-commercial project. Linked source pages and images can have separate owners and terms.
- [USDA FoodData Central](https://fdc.nal.usda.gov/) data is public domain and published under CC0 1.0.
- Packaged-product data comes from [Open Food Facts](https://world.openfoodfacts.org/terms-of-use) and can be incomplete or outdated.
- AI inference is paid by the application author. Submitted recipe text is processed by the configured recipe provider. Compressed ingredient photos leave the app for the selected Meta or Gemini recognition provider. Generated and recognized results require review.
- Exercise and nutrition information is educational and not medical advice. Stop exercising if you experience pain and consult a qualified professional when appropriate.

Source datasets, downloaded media, credentials, environment files, and generated SQLite databases are intentionally excluded from Git.
