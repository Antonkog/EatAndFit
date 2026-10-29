import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Utensils,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { localDate, saveFood, type MealType } from '../data/db';
import { recipeSearchParams } from './filters';
import type { Recipe, RecipePage } from './types';

const DATASET_URL = 'https://huggingface.co/datasets/datahiveai/recipes-with-nutrition';
const cuisineOptions = ['American', 'Asian', 'British', 'Chinese', 'French', 'Greek', 'Indian', 'Italian', 'Japanese', 'Mediterranean', 'Mexican', 'Middle Eastern', 'Spanish', 'Thai'];
const dishOptions = ['Bread', 'Desserts', 'Main course', 'Pancake', 'Salad', 'Sandwiches', 'Side dish', 'Soup', 'Starter'];
const mealOptions = ['Breakfast', 'Brunch', 'Lunch', 'Dinner', 'Snack'];
const dietOptions = ['Balanced', 'High-fiber', 'High-protein', 'Low-carb', 'Low-fat', 'Low-sodium'];
const healthOptions = ['Dairy-free', 'Egg-free', 'Gluten-free', 'Keto-friendly', 'Peanut-free', 'Vegan', 'Vegetarian'];
const meals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

type Filters = { cuisine: string; dish: string; meal: string; diet: string; health: string; minCalories: string; maxCalories: string };
const emptyFilters: Filters = { cuisine: '', dish: '', meal: '', diet: '', health: '', minCalories: '', maxCalories: '' };

function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }

export function RecipeView({
  initialDate = localDate(),
  initialIngredients = [],
  onOpenAi,
  onAdded,
}: {
  initialDate?: string;
  initialIngredients?: string[];
  onOpenAi: () => void;
  onAdded: (date: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [data, setData] = useState<RecipePage>();
  const [selected, setSelected] = useState<Recipe>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      const params = recipeSearchParams({ query: query || ingredients[0] || '', page: String(page), pageSize: '12', ...filters });
      fetch(`/api/recipes?${params}`)
        .then((response) => {
          if (!response.ok) throw new Error('Recipe catalog is unavailable. Import the DataHive dataset to enable it.');
          return response.json() as Promise<RecipePage>;
        })
        .then((value) => { setData(value); setError(''); })
        .catch((reason: Error) => setError(reason.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [filters, ingredients, page, query, refresh]);

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 12)));

  const reset = () => {
    setDraft('');
    setQuery('');
    setIngredients([]);
    setFilters(emptyFilters);
    setFiltersOpen(false);
    setPage(1);
  };

  return (
    <section>
      <div className="recipe-heading">
        <h1>Recipes</h1>
        <button className="primary-button large" onClick={onOpenAi}><Sparkles size={18} /> Create with AI</button>
      </div>

      <form className="recipe-search" onSubmit={(event) => { event.preventDefault(); setQuery(draft.trim()); setPage(1); }}>
        <label className="search-box"><Search size={17} /><input aria-label="Search recipes" placeholder="Search recipes" value={draft} onChange={(event) => { setDraft(event.target.value); if (!event.target.value) setQuery(''); }} /></label>
        <button className="primary-button" type="submit"><Search size={17} /> Search recipes</button>
      </form>

      {ingredients.length > 0 && (
        <div className="ingredient-filter-panel">
          <header><strong>Scanned ingredients</strong><button onClick={() => setIngredients([])}>Clear ingredients</button></header>
          <div>{ingredients.map((ingredient) => <button key={ingredient} onClick={() => setIngredients((items) => items.filter((item) => item !== ingredient))}>{ingredient}<X size={14} /></button>)}</div>
        </div>
      )}

      <details className="filters-panel" open={filtersOpen} onToggle={(event) => setFiltersOpen(event.currentTarget.open)}>
        <summary><SlidersHorizontal size={17} /><strong>Filters</strong>{activeFilters > 0 && <span className="badge solid">{activeFilters}</span>}<ChevronDown size={17} /></summary>
        <div className="filters-body">
          <div className="recipe-filter-grid">
            <FilterSelect label="All cuisines" value={filters.cuisine} options={cuisineOptions} onChange={(value) => { setFilters({ ...filters, cuisine: value }); setPage(1); }} />
            <FilterSelect label="All dish types" value={filters.dish} options={dishOptions} onChange={(value) => { setFilters({ ...filters, dish: value }); setPage(1); }} />
            <FilterSelect label="All meal types" value={filters.meal} options={mealOptions} onChange={(value) => { setFilters({ ...filters, meal: value }); setPage(1); }} />
            <FilterSelect label="All diets" value={filters.diet} options={dietOptions} onChange={(value) => { setFilters({ ...filters, diet: value }); setPage(1); }} />
            <FilterSelect label="All health labels" value={filters.health} options={healthOptions} onChange={(value) => { setFilters({ ...filters, health: value }); setPage(1); }} />
          </div>
          <div className="calorie-filters">
            <FilterNumber label="Minimum calories" value={filters.minCalories} onChange={(value) => setFilters({ ...filters, minCalories: value })} />
            <FilterNumber label="Maximum calories" value={filters.maxCalories} onChange={(value) => setFilters({ ...filters, maxCalories: value })} />
            <button className="text-button" type="button" onClick={reset}><RotateCcw size={16} /> Reset filters</button>
          </div>
        </div>
      </details>

      {error && <div className="error-state"><AlertTriangle /><div><strong>{error}</strong><button className="text-button" onClick={() => setRefresh((value) => value + 1)}>Try again</button></div></div>}
      {loading ? <div className="loading-state"><LoaderCircle className="spin" /></div> : data?.items.length ? (
        <>
          <div className="recipe-grid">
            {data.items.map((recipe) => <RecipeCard recipe={recipe} key={recipe.id} onClick={() => setSelected(recipe)} />)}
          </div>
          <div className="pagination">
            <button className="icon-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous"><ChevronLeft /></button>
            <span>Page {page} / {totalPages}</span>
            <button className="icon-button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} aria-label="Next"><ChevronRight /></button>
          </div>
        </>
      ) : !error && <div className="empty-card">{ingredients.length ? 'No recipes match these ingredients.' : 'No recipes found.'}</div>}

      <p className="data-attribution"><a href={DATASET_URL} target="_blank" rel="noreferrer">DataHive recipe dataset · CC BY-NC 4.0 · non-commercial use only.</a></p>
      {selected && <RecipeDetail recipe={selected} initialDate={initialDate} onClose={() => setSelected(undefined)} onAdded={onAdded} />}
    </section>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{options.map((option) => <option value={option} key={option}>{option}</option>)}</select>;
}

function FilterNumber({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<span><input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} /><i>kcal</i></span></label>;
}

function RecipeCard({ recipe, onClick }: { recipe: Recipe; onClick: () => void }) {
  const nutrition = recipeNutrition(recipe);
  return (
    <button className="recipe-card" onClick={onClick}>
      <RecipeImage src={recipe.imageUrl} loading="lazy" fallbackClass="recipe-placeholder" />
      <span className="recipe-card-body">
        <span className="badge-row">{[...recipe.dish, ...recipe.meal].slice(0, 2).map((item) => <i className="badge outline" key={item}>{item}</i>)}</span>
        <strong>{recipe.title}</strong>
        <small>{recipe.source}</small>
        <em>{Math.round(nutrition.calories)} kcal · Protein {nutrition.protein.toFixed(1)}g · Fat {nutrition.fat.toFixed(1)}g</em>
      </span>
    </button>
  );
}

function RecipeImage({ src, className, fallbackClass, loading }: { src?: string; className?: string; fallbackClass: string; loading?: 'lazy' | 'eager' }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className={fallbackClass}><Utensils /></span>;
  return <img className={className} src={src} alt="" loading={loading} referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

function nutrient(recipe: Recipe, term: string) {
  const item = Object.values(recipe.nutrients).find((value) => value.label.toLowerCase().includes(term));
  return Number(item?.quantity ?? 0) / Math.max(1, recipe.servings);
}

function recipeNutrition(recipe: Recipe) {
  return {
    calories: Number(recipe.calories || 0) / Math.max(1, recipe.servings),
    protein: nutrient(recipe, 'protein'),
    carbs: nutrient(recipe, 'carbohydrate'),
    fat: nutrient(recipe, 'fat'),
  };
}

function RecipeDetail({ recipe, initialDate, onClose, onAdded }: { recipe: Recipe; initialDate: string; onClose: () => void; onAdded: (date: string) => void }) {
  const [date, setDate] = useState(initialDate);
  const [meal, setMeal] = useState<MealType>('dinner');
  const [servings, setServings] = useState(1);
  const [added, setAdded] = useState(false);
  const nutrition = useMemo(() => recipeNutrition(recipe), [recipe]);

  const save = async () => {
    await saveFood({
      id: crypto.randomUUID(),
      date,
      title: recipe.title,
      provider: 'datahive',
      mealType: meal,
      quantity: servings,
      quantityUnit: 'serving',
      imageUrl: recipe.imageUrl,
      calories: nutrition.calories * servings,
      protein: nutrition.protein * servings,
      carbs: nutrition.carbs * servings,
      fat: nutrition.fat * servings,
      payload: recipe,
    });
    setAdded(true);
    onAdded(date);
    onClose();
  };

  return (
    <div className="sheet-overlay" role="dialog" aria-modal="true" aria-label={recipe.title}>
      <article className="side-sheet recipe-sheet">
        <button className="sheet-close" aria-label="Close" onClick={onClose}><X /></button>
        <header><h2>{recipe.title}</h2><p>Source: {recipe.source}</p></header>
        <div className="sheet-content">
          <RecipeImage src={recipe.imageUrl} className="recipe-detail-image" fallbackClass="recipe-detail-placeholder" />
          <div className="badge-row">{[...recipe.cuisine, ...recipe.dish, ...recipe.meal].map((item) => <span className="badge solid" key={item}>{item}</span>)}</div>
          {recipe.diet.length > 0 && <LabelGroup title="Diet labels" labels={recipe.diet} />}
          {recipe.health.length > 0 && <LabelGroup title="Health labels" labels={recipe.health} />}
          {recipe.cautions.length > 0 && <section className="caution-panel"><h3>Cautions</h3><div className="badge-row">{recipe.cautions.map((item) => <span className="badge outline" key={item}>{item}</span>)}</div></section>}
          <section><h3>Ingredients</h3><ul className="ingredient-lines">{recipe.ingredientLines.map((line) => <li key={line}>{line}</li>)}</ul></section>
          <a className="primary-button" href={recipe.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Cooking instructions</a>
          <section><h3>Nutrients per serving</h3><MacroGrid values={nutrition} /><FullNutrients recipe={recipe} /></section>
          <div className="save-food-panel">
            <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            <label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value as MealType)}>{meals.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
            <label>Servings<input type="number" min="0.25" step="0.25" value={servings} onChange={(event) => setServings(Number(event.target.value))} /></label>
            <button className="primary-button" disabled={servings <= 0} onClick={() => void save()}><Plus size={17} /> {added ? 'Food added' : 'Add food'}</button>
          </div>
          <p className="data-attribution"><a href={DATASET_URL} target="_blank" rel="noreferrer">DataHive recipe dataset · CC BY-NC 4.0 · non-commercial use only.</a></p>
        </div>
      </article>
    </div>
  );
}

function LabelGroup({ title, labels }: { title: string; labels: string[] }) {
  return <section className="label-group"><h3>{title}</h3><div className="badge-row">{labels.map((item) => <span className="badge outline" key={item}>{item}</span>)}</div></section>;
}

function MacroGrid({ values }: { values: { calories: number; protein: number; carbs: number; fat: number } }) {
  return <div className="macro-grid"><div><small>Calories</small><strong>{Math.round(values.calories)} kcal</strong></div><div><small>Protein</small><strong>{values.protein.toFixed(1)} g</strong></div><div><small>Carbs</small><strong>{values.carbs.toFixed(1)} g</strong></div><div><small>Fat</small><strong>{values.fat.toFixed(1)} g</strong></div></div>;
}

function FullNutrients({ recipe }: { recipe: Recipe }) {
  const items = Object.entries(recipe.nutrients).filter(([, value]) => Number.isFinite(value.quantity) && value.quantity > 0);
  return <dl className="full-nutrients">{items.map(([key, item]) => <div key={key}><dt>{item.label}</dt><dd>{(item.quantity / Math.max(1, recipe.servings)).toFixed(item.quantity >= 100 ? 0 : 1)} {item.unit}</dd></div>)}</dl>;
}
