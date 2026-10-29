import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { aiConfiguration, generateRecipes } from './ai-provider.mjs';
import {
  createIngredientRecognitionProvider,
  detectIngredients,
  INGREDIENT_REQUEST_BODY_LIMIT,
  IngredientRecognitionError,
} from './ingredient-provider.mjs';
import { findProduct } from './openfoodfacts.mjs';

const port = Number(process.env.API_PORT ?? 3000);
const host = process.env.API_HOST ?? '0.0.0.0';
const recipePath = process.env.RECIPE_DB_PATH ?? './data/recipes.sqlite';
const nutritionPath = process.env.NUTRITION_DB_PATH ?? './data/nutrition.sqlite';
function json(response, status, payload) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': 'http://localhost:5173' }); response.end(JSON.stringify(payload)); }
function parseRecipe(item) { for (const key of ['cuisine','dish','meal','diet','health','cautions','ingredientLines']) { try { item[key] = JSON.parse(item[key] || '[]'); } catch { item[key] = []; } } try { item.nutrients = JSON.parse(item.nutrients || '{}'); } catch { item.nutrients = {}; } return item; }
function recipes(url) {
  const db = new DatabaseSync(recipePath, { readOnly: true }); const page = Math.max(1, Number(url.searchParams.get('page') ?? 1)); const pageSize = Math.min(40, Math.max(1, Number(url.searchParams.get('pageSize') ?? 20))); const query = url.searchParams.get('query')?.trim(); const clauses = []; const values = {};
  for (const [parameter, column] of [['cuisine','cuisine'],['dish','dish'],['meal','meal'],['diet','diet'],['health','health']]) { const value = url.searchParams.get(parameter); if (value) { clauses.push(`${column} LIKE @${parameter}`); values[parameter] = `%${value}%`; } }
  if (query) { clauses.push('(title LIKE @query OR ingredient_lines LIKE @query)'); values.query = `%${query}%`; }
  const minCalories = Number(url.searchParams.get('minCalories')); const maxCalories = Number(url.searchParams.get('maxCalories'));
  if (Number.isFinite(minCalories) && minCalories > 0) { clauses.push('calories >= @minCalories'); values.minCalories = minCalories; }
  if (Number.isFinite(maxCalories) && maxCalories > 0) { clauses.push('calories <= @maxCalories'); values.maxCalories = maxCalories; }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''; const total = db.prepare(`SELECT COUNT(*) AS count FROM recipes ${where}`).get(values).count;
  const items = db.prepare(`SELECT id,title,source,url,image_url AS imageUrl,servings,calories,cuisine,dish,meal,diet,health,cautions,ingredient_lines AS ingredientLines,nutrients FROM recipes ${where} ORDER BY title LIMIT @limit OFFSET @offset`).all({ ...values, limit: pageSize, offset: (page - 1) * pageSize }); db.close(); return { items: items.map(parseRecipe), page, pageSize, total };
}
function nutritionSearch(url) { const query=url.searchParams.get('q')?.trim(); if(!query) return {items:[]}; const db=new DatabaseSync(nutritionPath,{readOnly:true}); const items=db.prepare('SELECT f.fdc_id AS fdcId,f.description,f.data_type AS dataType FROM food_search s JOIN foods f ON f.fdc_id=s.fdc_id WHERE food_search MATCH @query ORDER BY rank LIMIT 20').all({query:`${query.replace(/[^a-zA-Z0-9 ]/g,' ')}*`}); db.close(); return {items}; }
function nutritionFood(id) { const db=new DatabaseSync(nutritionPath,{readOnly:true}); const food=db.prepare('SELECT fdc_id AS fdcId,description,data_type AS dataType FROM foods WHERE fdc_id=?').get(id); if(!food){db.close();return null} food.nutrients=db.prepare('SELECT n.name,n.unit,fn.amount FROM food_nutrients fn JOIN nutrients n ON n.id=fn.nutrient_id WHERE fn.fdc_id=? ORDER BY n.name').all(id); food.portions=db.prepare('SELECT amount,unit,grams FROM portions WHERE fdc_id=?').all(id); db.close(); return food; }
function readBody(request, maxBytes = 250000){return new Promise((resolve,reject)=>{const chunks=[];let size=0;let rejected=false;request.on('data',(chunk)=>{size+=chunk.length;if(size>maxBytes){if(!rejected){rejected=true;reject(new IngredientRecognitionError('Request body is too large.',413,'request_too_large'))}return}chunks.push(chunk)});request.on('end',()=>{if(rejected)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'))}catch{reject(new IngredientRecognitionError('Request body must contain valid JSON.',400,'invalid_json'))}});request.on('error',reject)})}
async function calculateNutrition(request){const body=await readBody(request);if(!Array.isArray(body.items))throw new Error('INVALID');const totals={};for(const item of body.items.slice(0,100)){const food=nutritionFood(Number(item.fdcId));if(!food)continue;for(const nutrient of food.nutrients){const key=`${nutrient.name}|${nutrient.unit}`;const value=(Number(nutrient.amount)||0)*(Number(item.grams)||0)/100;totals[key]=(totals[key]||0)+value}}return {nutrients:Object.entries(totals).map(([key,amount])=>{const [name,unit]=key.split('|');return{name,unit,amount}})} }
export function createApiServer({ ingredientProvider = createIngredientRecognitionProvider() } = {}) {
return createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  try {
    if (url.pathname === '/api/recipes/healthz') return json(response, 200, { ok: true });
    if (url.pathname === '/api/recipes') return json(response, 200, recipes(url));
    if (url.pathname === '/api/ai/recipes/healthz') return json(response, 200, { ok: true, configured: aiConfiguration().configured });
    if (url.pathname === '/api/ai/recipes/meta') { const config=aiConfiguration(); return json(response,200,{provider:config.provider,model:config.model,configured:config.configured}); }
    if (url.pathname === '/api/ai/recipes/generate' && request.method === 'POST') return json(response,200,await generateRecipes(await readBody(request)));
    if (url.pathname === '/api/ai/ingredients/healthz') return json(response,200,{ok:true,...ingredientProvider.getHealth()});
    if (url.pathname === '/api/ai/ingredients/detect' && request.method === 'POST') return json(response,200,await detectIngredients(await readBody(request,INGREDIENT_REQUEST_BODY_LIMIT),ingredientProvider));
    if (url.pathname.startsWith('/api/products/')) { const product=await findProduct(url.pathname.split('/').at(-1)); return json(response,product?200:404,product??{error:'Product not found.'}); }
    if (url.pathname === '/api/nutrition/healthz') return json(response, 200, { ok: true });
    if (url.pathname === '/api/nutrition/search') return json(response, 200, nutritionSearch(url));
    if (url.pathname.startsWith('/api/nutrition/foods/')) { const food=nutritionFood(Number(url.pathname.split('/').at(-1))); return json(response,food?200:404,food??{error:'Food not found.'}); }
    if (url.pathname === '/api/nutrition/calculate' && request.method === 'POST') return json(response,200,await calculateNutrition(request));
    return json(response, 404, { error: 'Not found' });
  } catch (error) { const recognition=error instanceof IngredientRecognitionError; const unavailable=error.code==='SQLITE_CANTOPEN'; const status=recognition?error.status:error.message==='INVALID'||error.message==='MODEL_FORMAT'?400:error.message==='AI_NOT_CONFIGURED'?503:error.message==='AI_RATE_LIMIT'?429:unavailable?503:500; const message=recognition?error.message:error.message==='AI_NOT_CONFIGURED'?'AI generation is not configured.':error.message==='AI_RATE_LIMIT'?'The AI service is busy. Try again shortly.':unavailable?'Data service is not ready.':'Request failed.'; return json(response,status,{error:message}); }
});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createApiServer().listen(port, host, () => console.log(`Eat & Fit API listening on ${host}:${port}`));
}

