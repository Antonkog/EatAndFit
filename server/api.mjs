import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const port = Number(process.env.API_PORT ?? 3000);
const recipePath = process.env.RECIPE_DB_PATH ?? './data/recipes.sqlite';
function json(response, status, payload) { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': 'http://localhost:5173' }); response.end(JSON.stringify(payload)); }
function parseRecipe(item) { for (const key of ['cuisine','dish','meal','diet','health','cautions','ingredientLines']) { try { item[key] = JSON.parse(item[key] || '[]'); } catch { item[key] = []; } } try { item.nutrients = JSON.parse(item.nutrients || '{}'); } catch { item.nutrients = {}; } return item; }
function recipes(url) {
  const db = new DatabaseSync(recipePath, { readOnly: true }); const page = Math.max(1, Number(url.searchParams.get('page') ?? 1)); const pageSize = Math.min(40, Math.max(1, Number(url.searchParams.get('pageSize') ?? 20))); const query = url.searchParams.get('query')?.trim(); const clauses = []; const values = {};
  for (const [parameter, column] of [['cuisine','cuisine'],['dish','dish'],['meal','meal'],['diet','diet'],['health','health']]) { const value = url.searchParams.get(parameter); if (value) { clauses.push(`${column} LIKE @${parameter}`); values[parameter] = `%${value}%`; } }
  if (query) { clauses.push('(title LIKE @query OR ingredient_lines LIKE @query)'); values.query = `%${query}%`; }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''; const total = db.prepare(`SELECT COUNT(*) AS count FROM recipes ${where}`).get(values).count;
  const items = db.prepare(`SELECT id,title,source,url,image_url AS imageUrl,servings,calories,cuisine,dish,meal,diet,health,cautions,ingredient_lines AS ingredientLines,nutrients FROM recipes ${where} ORDER BY title LIMIT @limit OFFSET @offset`).all({ ...values, limit: pageSize, offset: (page - 1) * pageSize }); db.close(); return { items: items.map(parseRecipe), page, pageSize, total };
}
createServer((request, response) => { const url = new URL(request.url ?? '/', `http://${request.headers.host}`); try { if (url.pathname === '/api/recipes/healthz') return json(response, 200, { ok: true }); if (url.pathname === '/api/recipes') return json(response, 200, recipes(url)); return json(response, 404, { error: 'Not found' }); } catch (error) { return json(response, error.code === 'SQLITE_CANTOPEN' ? 503 : 500, { error: error.code === 'SQLITE_CANTOPEN' ? 'Recipe catalog is not ready.' : 'Request failed.' }); } }).listen(port, '127.0.0.1', () => console.log(`Eat & Fit API listening on ${port}`));

