import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  Clock3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { readJsonResponse } from '../api/readJsonResponse';
import { localDate, saveFood, type MealType } from '../data/db';
import { ingredientSearchQuery, nutritionPerServing, suggestIngredientGrams, type UsdaNutrient, type UsdaPortion } from '../nutrition/recipeNutrition';
import { IngredientScannerTrigger } from '../scanner/ScanView';
import { getRecognitionCredential } from '../settings/secureKeys';
import { generateRecipesWithMeta } from './metaRecipeGeneration';
import { validateAiFilters, type AiRecipe } from './validation';

type Range = { min: string; max: string };
type Food = { fdcId: number; description: string; dataType: string };
type FoodDetails = Food & { portions?: UsdaPortion[] };
type IngredientMatch = { fdcId: number; grams: number };

const diets = ['balanced', 'high-fiber', 'high-protein', 'low-carb', 'low-fat', 'low-sodium', 'vegan', 'vegetarian'];
const allergens = ['celery', 'crustacean', 'dairy', 'egg', 'fish', 'gluten', 'mustard', 'peanut', 'sesame', 'shellfish', 'soy', 'tree-nut', 'wheat'];
const dishTypes = ['Main course', 'Side dish', 'Soup', 'Salad', 'Sandwich', 'Dessert'];
const mealTypes = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const meals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const cuisines = ['American', 'Chinese', 'French', 'Georgian', 'Greek', 'Indian', 'Italian', 'Japanese', 'Korean', 'Mediterranean', 'Mexican', 'Middle Eastern', 'Persian', 'Spanish', 'Thai', 'Turkish'];

function parseList(value: string) { return [...new Set(value.split(/[,;.\n]+/).map((item) => item.trim()).filter(Boolean))]; }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }

export function AiRecipeView({
  initialDate = localDate(),
  initialRequiredIngredients = [],
  backDestination = 'recipes',
  onBack,
  onOpenSettings,
  onAdded,
}: {
  initialDate?: string;
  initialRequiredIngredients?: string[];
  backDestination?: 'recipes' | 'scan';
  onBack: () => void;
  onOpenSettings: () => void;
  onAdded: (date: string) => void;
}) {
  const [idea, setIdea] = useState('');
  const [required, setRequired] = useState(initialRequiredIngredients.join(', '));
  const [cuisine, setCuisine] = useState('');
  const [dishType, setDishType] = useState('');
  const [mealType, setMealType] = useState('');
  const [selectedDiets, setSelectedDiets] = useState<string[]>([]);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [excluded, setExcluded] = useState('');
  const [calories, setCalories] = useState<Range>({ min: '', max: '' });
  const [protein, setProtein] = useState<Range>({ min: '', max: '' });
  const [carbs, setCarbs] = useState<Range>({ min: '', max: '' });
  const [fat, setFat] = useState<Range>({ min: '', max: '' });
  const [maxTime, setMaxTime] = useState('');
  const [servings, setServings] = useState('2');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [recipes, setRecipes] = useState<AiRecipe[]>([]);
  const [selected, setSelected] = useState<AiRecipe>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activeFilterCount = [cuisine, dishType, mealType, excluded, maxTime, calories.min, calories.max, protein.min, protein.max, carbs.min, carbs.max, fat.min, fat.max, ...selectedDiets, ...selectedAllergens].filter(Boolean).length;

  const submit = async () => {
    const servingCount = Number(servings);
    const issue = validateAiFilters({ idea, servings: servingCount });
    if (issue) { setError(issue); return; }
    for (const range of [calories, protein, carbs, fat]) {
      if (range.min && range.max && Number(range.min) > Number(range.max)) {
        setError('Minimum values cannot exceed maximum values.');
        setFiltersOpen(true);
        return;
      }
    }
    setLoading(true);
    setError('');
    try {
      const credential = await getRecognitionCredential();
      if (!credential) throw new Error('Add a Meta or Google Gemini API key in Settings first.');
      const filters = {
        idea,
        cuisine,
        dishType,
        mealType,
        diet: selectedDiets.join(', '),
        ingredients: required,
        exclude: [...selectedAllergens, ...parseList(excluded)].join(', '),
        servings: servingCount,
        nutrition: { calories, protein, carbs, fat },
        maxTime,
      };
      if (credential.provider === 'META') {
        setRecipes(await generateRecipesWithMeta(filters, credential.apiKey));
        return;
      }
      const response = await fetch('/api/ai/recipes/generate', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${credential.apiKey}`,
          'content-type': 'application/json',
          'x-recognition-provider': credential.provider,
        },
        body: JSON.stringify(filters),
      });
      const data = await readJsonResponse<{ error?: string; recipes: AiRecipe[] }>(response, 'Recipe generation');
      if (!response.ok) throw new Error(data.error || 'Recipe generation failed.');
      setRecipes(data.recipes);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Recipe generation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <button className="back-button ai-back" onClick={onBack}><ChevronLeft size={17} /> {backDestination === 'recipes' ? 'Back to Recipes' : 'Back to Scan'}</button>
      <div className="ai-heading"><p className="eyebrow">AI recipe generator</p><h1>AI Recipes</h1></div>

      <div className="scanner-launch-panel">
        <IngredientScannerTrigger currentIngredients={parseList(required)} onConfirm={(items) => setRequired(items.join(', '))} onOpenSettings={onOpenSettings} />
      </div>

      <form className="ai-form-card" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label className="field-label">Recipe name or idea<input className="large-input" value={idea} maxLength={120} onChange={(event) => setIdea(event.target.value)} placeholder="For example: squid ink pasta with seafood" /></label>
        <label className="field-label">Required ingredients<input value={required} maxLength={500} onChange={(event) => setRequired(event.target.value)} placeholder="Separate with commas, periods, semicolons, or new lines" /></label>
        <details className="filters-panel" open={filtersOpen} onToggle={(event) => setFiltersOpen(event.currentTarget.open)}>
          <summary><SlidersHorizontal size={17} /><strong>Filters</strong>{activeFilterCount > 0 && <span className="badge solid">{activeFilterCount}</span>}<ChevronDown size={17} /></summary>
          <div className="filters-body ai-filters">
            <div className="three-fields">
              <label>Cuisine<input value={cuisine} list="ai-cuisines" placeholder="Any cuisine" onChange={(event) => setCuisine(event.target.value)} /><datalist id="ai-cuisines">{cuisines.map((item) => <option value={item} key={item} />)}</datalist></label>
              <label>Dish type<select value={dishType} onChange={(event) => setDishType(event.target.value)}><option value="">Any</option>{dishTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Meal type<select value={mealType} onChange={(event) => setMealType(event.target.value)}><option value="">Any</option>{mealTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <ChoiceGroup label="Diet preferences" values={diets} selected={selectedDiets} onChange={setSelectedDiets} />
            <ChoiceGroup label="Exclude allergens" values={allergens} selected={selectedAllergens} onChange={setSelectedAllergens} />
            <label className="field-label">Excluded ingredients<input value={excluded} onChange={(event) => setExcluded(event.target.value)} placeholder="Separate with commas, periods, semicolons, or new lines" /></label>
            <div className="range-grid">
              <RangeField label="Calories" unit="kcal" value={calories} onChange={setCalories} />
              <RangeField label="Protein" unit="g" value={protein} onChange={setProtein} />
              <RangeField label="Carbs" unit="g" value={carbs} onChange={setCarbs} />
              <RangeField label="Fat" unit="g" value={fat} onChange={setFat} />
            </div>
            <div className="two-fields">
              <NumberField label="Maximum total time" unit="min" value={maxTime} onChange={setMaxTime} min={1} max={720} />
              <NumberField label="Recipe servings" unit="" value={servings} onChange={setServings} min={1} max={12} />
            </div>
          </div>
        </details>
        {error && <div className="error-state compact"><AlertTriangle /><div><strong>{error}</strong><button type="button" className="text-button" onClick={() => void submit()}><RefreshCw size={15} /> Retry</button><button type="button" className="text-button" onClick={onOpenSettings}>Open settings</button></div></div>}
        <button className="primary-button large full" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <Sparkles size={18} />}{loading ? 'Generating two recipes…' : 'Generate recipes'}</button>
      </form>

      <p className="estimate-warning">AI and database values are estimates and are not medical advice.</p>
      <div className="ai-results-grid">
        {recipes.map((recipe) => <AiRecipeCard key={recipe.title} recipe={recipe} onClick={() => setSelected(recipe)} />)}
      </div>
      {selected && <AiRecipeDetail recipe={selected} initialDate={initialDate} onClose={() => setSelected(undefined)} onAdded={onAdded} />}
    </section>
  );
}

function ChoiceGroup({ label, values, selected, onChange }: { label: string; values: string[]; selected: string[]; onChange: (value: string[]) => void }) {
  return <fieldset className="choice-group"><legend>{label}</legend><div>{values.map((item) => <label className={selected.includes(item) ? 'active' : ''} key={item}><input type="checkbox" checked={selected.includes(item)} onChange={() => onChange(selected.includes(item) ? selected.filter((value) => value !== item) : [...selected, item])} />{item.replaceAll('-', ' ')}</label>)}</div></fieldset>;
}

function RangeField({ label, unit, value, onChange }: { label: string; unit: string; value: Range; onChange: (value: Range) => void }) {
  return <fieldset className="range-field"><legend>{label} ({unit})</legend><div><input type="number" min="0" placeholder="Min" value={value.min} onChange={(event) => onChange({ ...value, min: event.target.value })} /><input type="number" min="0" placeholder="Max" value={value.max} onChange={(event) => onChange({ ...value, max: event.target.value })} /></div></fieldset>;
}

function NumberField({ label, unit, value, onChange, min, max }: { label: string; unit: string; value: string; onChange: (value: string) => void; min: number; max: number }) {
  return <label>{label}<span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} /><i>{unit}</i></span></label>;
}

function AiRecipeCard({ recipe, onClick }: { recipe: AiRecipe; onClick: () => void }) {
  return <button className="ai-recipe-card" onClick={onClick}><span><Utensils /></span><div><div className="badge-row"><i className="badge solid">AI recipe</i><i className="badge outline">{recipe.minutes} min</i></div><h2>{recipe.title}</h2><p>{recipe.description}</p><small>{recipe.nutrition.calories} kcal · Protein {recipe.nutrition.protein.toFixed(1)}g · Fat {recipe.nutrition.fat.toFixed(1)}g</small></div></button>;
}

function AiRecipeDetail({ recipe, initialDate, onClose, onAdded }: { recipe: AiRecipe; initialDate: string; onClose: () => void; onAdded: (date: string) => void }) {
  const [mode, setMode] = useState<'ai' | 'usda'>('ai');
  const [matchOpen, setMatchOpen] = useState(false);
  const [date, setDate] = useState(initialDate);
  const [meal, setMeal] = useState<MealType>('dinner');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [usdaNutrition, setUsdaNutrition] = useState<typeof recipe.nutrition>();
  const nutrition = mode === 'usda' && usdaNutrition ? usdaNutrition : recipe.nutrition;

  const save = async () => {
    await saveFood({ id: crypto.randomUUID(), date, title: recipe.title, provider: 'ai', mealType: meal, quantity, quantityUnit: 'serving', calories: nutrition.calories * quantity, protein: nutrition.protein * quantity, carbs: nutrition.carbs * quantity, fat: nutrition.fat * quantity, payload: recipe });
    setAdded(true);
    onAdded(date);
    onClose();
  };

  return (
    <div className="sheet-overlay" role="dialog" aria-modal="true" aria-label={recipe.title}>
      <article className="side-sheet ai-recipe-sheet">
        <button className="sheet-close" aria-label="Close" onClick={onClose}><X /></button>
        <header><h2>{recipe.title}</h2><p>Generated by the configured AI model with an optional nutrition check.</p></header>
        <div className="sheet-content">
          <div className="recipe-detail-placeholder"><Utensils /></div>
          <p>{recipe.description}</p>
          <div className="badge-row"><span className="badge solid">AI recipe</span><span className="badge outline"><Clock3 size={13} /> {recipe.minutes} min</span></div>
          <div className="nutrition-mode"><button className={mode === 'ai' ? 'active' : ''} onClick={() => setMode('ai')}>AI estimate</button><button className={mode === 'usda' ? 'active' : ''} onClick={() => usdaNutrition ? setMode('usda') : setMatchOpen(true)}>Nutrition check</button></div>
          <MacroGrid values={nutrition} />
          <section><h3>Ingredients</h3><div className="ai-ingredient-list">{recipe.ingredients.map((item) => <div key={item}><strong>{item}</strong><small>{mode === 'usda' ? 'USDA database' : 'AI estimate'}</small></div>)}</div></section>
          <section><h3>Instructions</h3><ol className="ingredient-lines numbered">{recipe.steps.map((item) => <li key={item}>{item}</li>)}</ol></section>
          <div className="save-food-panel"><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value as MealType)}>{meals.map((item) => <option value={item} key={item}>{titleCase(item)}</option>)}</select></label><label>Servings to add<input type="number" min="0.25" step="0.25" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><button className="primary-button" onClick={() => void save()}><Plus size={17} /> {added ? 'Added to calendar' : 'Add to calendar'}</button></div>
          <p className="estimate-warning">AI and database values are estimates and are not medical advice.</p>
        </div>
      </article>
      {matchOpen && <UsdaMatchDialog recipe={recipe} onClose={() => setMatchOpen(false)} onUse={(value) => { setUsdaNutrition(value); setMode('usda'); setMatchOpen(false); }} />}
    </div>
  );
}

function UsdaMatchDialog({ recipe, onClose, onUse }: { recipe: AiRecipe; onClose: () => void; onUse: (value: AiRecipe['nutrition']) => void }) {
  const [ingredientIndex, setIngredientIndex] = useState(0);
  const [matches, setMatches] = useState<IngredientMatch[]>([]);
  const [query, setQuery] = useState(ingredientSearchQuery(recipe.ingredients[0] ?? ''));
  const [foods, setFoods] = useState<Food[]>([]);
  const [selected, setSelected] = useState<FoodDetails>();
  const [grams, setGrams] = useState('100');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Choose the closest USDA food for each ingredient, then calculate the recipe.');
  const ingredient = recipe.ingredients[ingredientIndex] ?? '';

  const search = async () => {
    setBusy(true);
    setStatus(`Searching USDA for ingredient ${ingredientIndex + 1}…`);
    try {
      const response = await fetch(`/api/nutrition/search?q=${encodeURIComponent(query)}`);
      const data = await readJsonResponse<{ error?: string; items?: Food[] }>(response, 'USDA search');
      if (!response.ok) throw new Error(data.error || 'USDA search failed.');
      setFoods(data.items ?? []);
      setStatus((data.items ?? []).length ? 'Select the closest food, then confirm the amount used in the whole recipe.' : 'No matches found. Edit the search or skip this ingredient.');
    } catch (value) {
      setStatus(value instanceof Error ? value.message : 'USDA search failed.');
    } finally {
      setBusy(false);
    }
  };

  const choose = async (food: Food) => {
    setBusy(true);
    setStatus('Loading portions…');
    try {
      const response = await fetch(`/api/nutrition/foods/${food.fdcId}`);
      const details = await readJsonResponse<FoodDetails & { error?: string }>(response, 'USDA food');
      if (!response.ok) throw new Error(details.error || 'USDA food could not be loaded.');
      setSelected(details);
      setGrams(String(suggestIngredientGrams(ingredient, details.portions)));
      setStatus('Confirm the gram amount for the whole recipe.');
    } catch (value) {
      setStatus(value instanceof Error ? value.message : 'USDA food could not be loaded.');
    } finally {
      setBusy(false);
    }
  };

  const calculate = async (items: IngredientMatch[]) => {
    if (!items.length) { setStatus('Match at least one ingredient before calculating.'); return; }
    setBusy(true);
    setStatus(`Calculating all ${items.length} matched ingredients…`);
    try {
      const response = await fetch('/api/nutrition/calculate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) });
      const data = await readJsonResponse<{ error?: string; nutrients?: UsdaNutrient[] }>(response, 'USDA calculation');
      if (!response.ok) throw new Error(data.error || 'USDA calculation failed.');
      onUse(nutritionPerServing(data.nutrients ?? [], recipe.servings));
    } catch (value) {
      setStatus(value instanceof Error ? value.message : 'USDA calculation failed.');
      setBusy(false);
    }
  };

  const continueToNext = (match?: IngredientMatch) => {
    const nextMatches = match ? [...matches, match] : matches;
    if (ingredientIndex === recipe.ingredients.length - 1) { void calculate(nextMatches); return; }
    const nextIndex = ingredientIndex + 1;
    setMatches(nextMatches);
    setIngredientIndex(nextIndex);
    setQuery(ingredientSearchQuery(recipe.ingredients[nextIndex] ?? ''));
    setFoods([]);
    setSelected(undefined);
    setGrams('100');
    setStatus('Choose the closest USDA food for this ingredient.');
  };

  const useMatch = () => {
    const amount = Number(grams);
    if (!selected || !Number.isFinite(amount) || amount <= 0) { setStatus('Enter a gram amount greater than zero.'); return; }
    continueToNext({ fdcId: selected.fdcId, grams: amount });
  };

  return <div className="dialog-backdrop"><section className="match-dialog" role="dialog" aria-modal="true"><button className="sheet-close" onClick={onClose}><X /></button><h2>Match ingredients to nutrition data</h2><div className="match-progress"><span>Ingredient {ingredientIndex + 1} of {recipe.ingredients.length}</span><strong>{ingredient}</strong></div><p>{status}</p><div className="usda-search"><input value={query} aria-label="USDA search" onChange={(event) => setQuery(event.target.value)} /><button className="text-button" disabled={busy || !query.trim()} onClick={() => void search()}><Search size={16} /> Search USDA</button></div><div className="usda-results">{foods.map((food) => <button className={selected?.fdcId === food.fdcId ? 'active' : ''} disabled={busy} key={food.fdcId} onClick={() => void choose(food)}><strong>{food.description}</strong><small>{food.dataType}</small></button>)}</div>{selected && <label className="usda-amount"><span>Amount used in the whole recipe</span><span><input type="number" min="0.1" step="0.1" value={grams} onChange={(event) => setGrams(event.target.value)} /> g</span><small>{selected.description}</small></label>}<footer><button className="text-button" onClick={onClose}>Cancel</button><button className="text-button" disabled={busy} onClick={() => continueToNext()}>Skip ingredient</button><button className="primary-button" disabled={!selected || busy} onClick={useMatch}>{busy ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />} {ingredientIndex === recipe.ingredients.length - 1 ? 'Calculate and use' : 'Use match and continue'}</button></footer></section></div>;
}

function MacroGrid({ values }: { values: { calories: number; protein: number; carbs: number; fat: number } }) {
  return <div className="macro-grid"><div><small>Calories</small><strong>{Math.round(values.calories)} kcal</strong></div><div><small>Protein</small><strong>{values.protein.toFixed(1)} g</strong></div><div><small>Carbs</small><strong>{values.carbs.toFixed(1)} g</strong></div><div><small>Fat</small><strong>{values.fat.toFixed(1)} g</strong></div></div>;
}

export const AiRecipeBuilder = AiRecipeView;
