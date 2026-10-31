import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import {
  detectIngredients,
  INGREDIENT_REQUEST_BODY_LIMIT,
  IngredientRecognitionError,
} from './ingredient-provider.mjs';
import { findProduct } from './openfoodfacts.mjs';
import { createNutritionProvider, NutritionCatalogError } from './nutrition-provider.mjs';
import { createRecipeProvider, RecipeCatalogError } from './recipe-provider.mjs';
import { generateRecipes, RecipeGenerationError } from './recipe-generation-provider.mjs';
import { calibrateTrainingEnergy, generateTrainingPlan, TrainingProviderError, verifyAiCredential } from './training-provider.mjs';
import { resolveCuisineLocation } from './location-provider.mjs';
import { analyzeMovementRequest, MovementAnalysisError } from './movement-provider.mjs';

const port = Number(process.env.API_PORT ?? 3000);
const host = process.env.API_HOST ?? '0.0.0.0';
const nutritionPath = process.env.NUTRITION_DB_PATH ?? './data/nutrition.sqlite';
function json(response, status, payload) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': 'http://localhost:5173' }); response.end(JSON.stringify(payload)); }
function readBody(request, maxBytes = 250000){return new Promise((resolve,reject)=>{const chunks=[];let size=0;let rejected=false;request.on('data',(chunk)=>{size+=chunk.length;if(size>maxBytes){if(!rejected){rejected=true;reject(new IngredientRecognitionError('Request body is too large.',413,'request_too_large'))}return}chunks.push(chunk)});request.on('end',()=>{if(rejected)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'))}catch{reject(new IngredientRecognitionError('Request body must contain valid JSON.',400,'invalid_json'))}});request.on('error',reject)})}
function recognitionCredentials(request) {
  const provider = String(request.headers['x-recognition-provider'] ?? '').trim().toUpperCase();
  const authorization = String(request.headers.authorization ?? '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]?.trim()) throw new IngredientRecognitionError('Add an API key in Settings before using Smart Scan.', 401, 'missing_user_key');
  return { provider, apiKey: match[1].trim() };
}
export function createApiServer({
  edition = process.env.APP_EDITION === 'byok' ? 'byok' : 'core',
  ingredientProvider,
  recipeGenerationProvider,
  recipeProvider,
  nutritionProvider,
  trainingProvider,
  locationProvider,
  movementProvider,
} = {}) {
const smartScannerEnabled = edition === 'byok';
let recipeCatalog = recipeProvider;
const getRecipeCatalog = () => recipeCatalog ??= createRecipeProvider();
let nutritionCatalog = nutritionProvider;
const getNutritionCatalog = () => nutritionCatalog ??= createNutritionProvider({ databasePath: nutritionPath });
return createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  try {
    if (url.pathname === '/api/location/cuisine') {
      const location = await (locationProvider ? locationProvider(request) : resolveCuisineLocation(request));
      response.setHeader('cache-control', 'private, max-age=3600');
      return json(response, 200, location);
    }
    if (url.pathname === '/api/recipes/healthz') {
      try { return json(response, 200, getRecipeCatalog().getHealth()); }
      catch (error) {
        if (error instanceof RecipeCatalogError) return json(response, error.status, { status: 'error', provider: 'datahive', configured: false, ready: false, total: 0, expectedTotal: Number(process.env.RECIPE_EXPECTED_ROWS ?? 39447), error: error.message });
        throw error;
      }
    }
    if (url.pathname === '/api/recipes') return json(response, 200, getRecipeCatalog().search(url.searchParams));
    if (url.pathname.startsWith('/api/recipes/')) return json(response, 200, getRecipeCatalog().getRecipe(decodeURIComponent(url.pathname.slice('/api/recipes/'.length))));
    if (smartScannerEnabled && url.pathname === '/api/ai/recipes/healthz') return json(response,200,{ok:true,keySource:'user-device',configured:false,supportedProviders:['meta','gemini']});
    if (smartScannerEnabled && url.pathname === '/api/ai/recipes/generate' && request.method === 'POST') return json(response,200,await generateRecipes(await readBody(request),recipeGenerationProvider,recipeGenerationProvider ? undefined : recognitionCredentials(request)));
    if (smartScannerEnabled && url.pathname === '/api/ai/ingredients/healthz') return json(response,200,{ok:true,keySource:'user-device',configured:false,supportedProviders:['meta','gemini']});
    if (smartScannerEnabled && url.pathname === '/api/ai/ingredients/detect' && request.method === 'POST') return json(response,200,await detectIngredients(await readBody(request,INGREDIENT_REQUEST_BODY_LIMIT),ingredientProvider,ingredientProvider ? undefined : recognitionCredentials(request)));
    if (smartScannerEnabled && url.pathname === '/api/ai/training/generate' && request.method === 'POST') return json(response,200,await generateTrainingPlan(await readBody(request,1_500_000),trainingProvider,trainingProvider ? undefined : recognitionCredentials(request)));
    if (smartScannerEnabled && url.pathname === '/api/ai/training/calibrate' && request.method === 'POST') return json(response,200,await calibrateTrainingEnergy(await readBody(request),trainingProvider,trainingProvider ? undefined : recognitionCredentials(request)));
    if (smartScannerEnabled && url.pathname === '/api/ai/movement/analyze' && request.method === 'POST') return json(response, 200, movementProvider ? await movementProvider(request) : await analyzeMovementRequest(request));
    if (smartScannerEnabled && url.pathname === '/api/ai/keys/verify' && request.method === 'POST') return json(response,200,await verifyAiCredential(trainingProvider,trainingProvider ? undefined : recognitionCredentials(request)));
    if (url.pathname.startsWith('/api/products/')) { const product=await findProduct(url.pathname.split('/').at(-1)); return json(response,product?200:404,product??{error:'Product not found.'}); }
    if (url.pathname === '/api/nutrition/healthz') {
      try { return json(response, 200, getNutritionCatalog().getHealth()); }
      catch (error) {
        if (error instanceof NutritionCatalogError) return json(response, error.status, { status: 'error', provider: 'usda-fooddata-central', configured: false, ready: false, error: error.message });
        throw error;
      }
    }
    if (url.pathname === '/api/nutrition/search') return json(response, 200, getNutritionCatalog().search(url.searchParams.get('q')));
    if (url.pathname.startsWith('/api/nutrition/foods/')) { const food=getNutritionCatalog().getFood(url.pathname.split('/').at(-1)); return json(response,food?200:404,food??{error:'Food not found.'}); }
    if (url.pathname === '/api/nutrition/calculate' && request.method === 'POST') return json(response,200,getNutritionCatalog().calculate((await readBody(request)).items));
    return json(response, 404, { error: 'Not found' });
  } catch (error) { const ai=error instanceof IngredientRecognitionError || error instanceof RecipeGenerationError || error instanceof TrainingProviderError || error instanceof MovementAnalysisError; const catalog=error instanceof RecipeCatalogError || error instanceof NutritionCatalogError; const unavailable=error.code==='SQLITE_CANTOPEN'; const status=ai||catalog?error.status:error.message==='INVALID'?400:unavailable?503:500; const message=ai||catalog?error.message:unavailable?'Data service is not ready.':'Request failed.'; return json(response,status,{error:message}); }
});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApiServer().listen(port, host, () => console.log(`Eat & Fit API listening on ${host}:${port}`));
}

