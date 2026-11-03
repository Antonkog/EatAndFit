# Eat & Fit

Eat & Fit is an English-language, mobile-first workout and nutrition app. It combines a 317-exercise video library, age-aware exercise-energy estimates, a local workout calendar, 39,447 searchable recipes, USDA nutrition calculations, and packaged-food lookup.

Workout and meal history is stored in the browser. There are no user accounts or cloud sync. Settings provides JSON export/import and complete deletion of local history.

## Free editions

- **Core** contains every feature that does not require a private model API key. Barcode lookup remains available, while the ingredient-recognition and AI-recipe controls are hidden.
- **AI edition** adds photo ingredient recognition, AI recipe generation, conservative adult energy calibration, and personalized two-week training plans. The hackathon configuration uses Meta through a server-mounted secret that is never sent to the browser. Optional `AI_CREDENTIAL_MODE=byok` retains encrypted device-key setup for later use. Gemini is implemented but disabled by the current application configuration. There is no automatic provider fallback.

In optional BYOK mode, keys are encrypted with AES-GCM using a non-exportable device-local key and stored in browser IndexedDB. They are excluded from backups and analytics. In the shared hackathon mode, no provider key is delivered to or stored by the browser: the Meta credential is mounted into the API container as a read-only Docker secret and used only by restricted same-origin routes.

Profiles are also local. Ages 6–18 use Youth Compendium estimates, ages 19–59 use Adult Compendium MET values, and ages 60+ prefer Older Adult MET60+ values. Ages 1–5 do not receive sourced calorie estimates. Completed exercise energy is frozen into workout history; reopening a set clears that completed estimate. Energy-equivalent weight is a rough comparison (`kcal ÷ 7,700`), not guaranteed weight loss.

## Local development

Requires Node.js 24+, Python 3.12+, and the separately obtained DataHive and USDA source files for the normal import workflow.

```bash
npm install
cp .env.example .env
python3 recipe-import/import_recipes.py /path/to/recipes.csv data/recipes.sqlite
python3 nutrition-import/import_usda.py /path/to/usda-csv data/nutrition.sqlite
npm run api
npm run dev
```

If the original USDA CSV directory is unavailable, the standalone recovery importer can download pinned public Foundation Foods, SR Legacy, and FNDDS releases and rebuild the same normalized local database. It uses USDA bulk downloads and does not require an API key:

```bash
python3 nutrition-import/recover_usda.py
```

By default, downloaded archives are cached under `data/usda-cache` and the recovered database is written to `data/nutrition.sqlite`. Use `--cache-dir`, `--output`, `--source`, or `--force` when a recovery needs different locations or archive overrides. This tool is not part of the normal Docker deployment.

Use `npm run api` with `npm run dev` for Core. The Core API does not expose AI routes. For local device-key development, set `AI_CREDENTIAL_MODE=byok` and run `npm run api:byok` with `npm run dev:byok`. No model API key belongs in `.env`, Docker configuration, source files, build arguments, or server environment variables.

Build one edition or both:

```bash
npm run build          # Core -> dist/
npm run build:byok     # BYOK -> dist/
npm run build:editions # Core -> dist/core, BYOK -> dist/byok
```

Docker defaults to Core. For the shared hackathon edition, create a secret file readable only by the deployment owner, then use the shared-AI Compose overlay:

```bash
install -d -m 700 secrets
install -m 600 /secure/path/meta_api_key secrets/meta_api_key
APP_EDITION=byok AI_CREDENTIAL_MODE=hybrid \
  docker compose -f compose.yaml -f compose.shared-ai.yaml up -d --build api web
```

The secret path is ignored by Git, not copied into either image, and never returned to the browser. At container startup a root entrypoint copies it into container tmpfs with node-only permissions, immediately drops to the unprivileged `node` user, and keeps no key in the process environment. Hybrid mode also keeps optional encrypted key fields in Settings: a saved personal key takes precedence for that browser, and removing it returns to the shared Meta service. A failed personal-key request never falls back automatically to the shared credential. Fully device-key-only builds remain available with `AI_CREDENTIAL_MODE=byok`. `GEMINI_API_ENABLED=true` is honored in hybrid or BYOK mode. AI recipe-photo generation is disabled by default in every edition; the dormant provider path can be enabled explicitly with `RECIPE_PHOTO_GENERATION_ENABLED=true`. Core always disables all AI providers and photo generation regardless of these values.

Settings can download a privacy-safe AI diagnostic file named `log.txt`. It records timestamped successes and sanitized failures for AI recipe text/photos, ingredient recognition, training generation/calibration, and exercise review. Failure entries include the provider/model, HTTP status when available, and a length-bounded raw error response, while never storing keys, prompts, photos, videos, or successful image payloads.

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
- In shared hackathon mode, ingredient recognition, AI recipe generation, adult energy calibration, personalized training, and consented movement review use the application author’s server-held Meta credential. Submitted content is sent to Meta for processing, provider terms and charges apply, and generated results require review. Optional BYOK mode uses the user-supplied provider key instead.
- Exercise and nutrition information is educational and not medical advice. Stop exercising if you experience pain and consult a qualified professional when appropriate.

Source datasets, downloaded media, credentials, environment files, and generated SQLite databases are intentionally excluded from Git.
