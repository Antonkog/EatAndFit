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
import { localDate, saveFood, type MealType } from '../data/db';
import { IngredientScannerTrigger } from '../scanner/ScanView';
import { validateAiFilters, type AiRecipe } from './validation';

type Range = { min: string; max: string };
type Food = { fdcId: number; description: string; dataType: string };

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
  onAdded,
}: {
  initialDate?: string;
  initialRequiredIngredients?: string[];
  backDestination?: 'recipes' | 'scan';
  onBack: () => void;
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
      const response = await fetch('/api/ai/recipes/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });
      const data = await response.json();
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
        <IngredientScannerTrigger currentIngredients={parseList(required)} onConfirm={(items) => setRequired(items.join(', '))} />
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
        {error && <div className="error-state compact"><AlertTriangle /><div><strong>{error}</strong><button type="button" className="text-button" onClick={() => void submit()}><RefreshCw size={15} /> Retry</button></div></div>}
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
  const [query, setQuery] = useState(parseList(recipe.ingredients[0] ?? '')[0] ?? '');
  const [foods, setFoods] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food>();
  const [status, setStatus] = useState('Choose the closest USDA food for each ingredient, then calculate the recipe.');
  const search = async () => {
    const response = await fetch(`/api/nutrition/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    setFoods(data.items ?? []);
  };
  const calculate = async () => {
    if (!selected) return;
    setStatus('Calculating nutrition…');
    const response = await fetch(`/api/nutrition/foods/${selected.fdcId}`);
    const details = await response.json();
    const amount = (term: string) => Number(details.nutrients?.find((item: { name: string }) => item.name.toLowerCase().includes(term))?.amount ?? 0);
    onUse({ calories: Math.round(amount('energy')), protein: amount('protein'), carbs: amount('carbohydrate'), fat: amount('fat') });
  };
  return <div className="dialog-backdrop"><section className="match-dialog" role="dialog" aria-modal="true"><button className="sheet-close" onClick={onClose}><X /></button><h2>Match ingredients to nutrition data</h2><p>{status}</p><div className="usda-search"><input value={query} onChange={(event) => setQuery(event.target.value)} /><button className="text-button" onClick={() => void search()}><Search size={16} /> Search USDA</button></div><div className="usda-results">{foods.map((food) => <button className={selected?.fdcId === food.fdcId ? 'active' : ''} key={food.fdcId} onClick={() => setSelected(food)}><strong>{food.description}</strong><small>{food.dataType}</small></button>)}</div><footer><button className="text-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!selected} onClick={() => void calculate()}><RefreshCw size={16} /> Calculate and use</button></footer></section></div>;
}

function MacroGrid({ values }: { values: { calories: number; protein: number; carbs: number; fat: number } }) {
  return <div className="macro-grid"><div><small>Calories</small><strong>{Math.round(values.calories)} kcal</strong></div><div><small>Protein</small><strong>{values.protein.toFixed(1)} g</strong></div><div><small>Carbs</small><strong>{values.carbs.toFixed(1)} g</strong></div><div><small>Fat</small><strong>{values.fat.toFixed(1)} g</strong></div></div>;
}

export const AiRecipeBuilder = AiRecipeView;
