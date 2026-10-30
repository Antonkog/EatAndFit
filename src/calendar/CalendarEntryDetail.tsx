import { Barcode, ExternalLink, Utensils, X } from 'lucide-react';
import { useEffect } from 'react';
import type { FoodEntry } from '../data/db';

type StoredPayload = {
  barcode?: string;
  basis?: string;
  brand?: string;
  cautions?: string[];
  cuisine?: string[];
  description?: string;
  diet?: string[];
  dish?: string[];
  health?: string[];
  ingredientLines?: string[];
  ingredients?: string[];
  meal?: string[];
  minutes?: number;
  source?: string;
  steps?: string[];
  url?: string;
};

function payloadOf(entry: FoodEntry): StoredPayload {
  return entry.payload && typeof entry.payload === 'object' ? entry.payload as StoredPayload : {};
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function quantityLabel(entry: FoodEntry) {
  const quantity = entry.quantity ?? 1;
  if (entry.quantityUnit === 'g') return `${quantity} g`;
  if (entry.quantityUnit === 'ml') return `${quantity} ml`;
  return `${quantity} ${quantity === 1 ? 'serving' : 'servings'}`;
}

function providerLabel(entry: FoodEntry, payload: StoredPayload) {
  if (entry.provider === 'datahive') return `Recipe · ${payload.source || 'DataHive'}`;
  if (entry.provider === 'ai') return 'AI-generated recipe';
  if (entry.provider === 'openfoodfacts') return 'Scanned product · Open Food Facts';
  if (entry.provider === 'manual') return 'Saved product';
  return titleCase(entry.provider);
}

function MacroGrid({ entry }: { entry: FoodEntry }) {
  return (
    <div className="macro-grid">
      <div><small>Calories</small><strong>{Math.round(entry.calories ?? 0)} kcal</strong></div>
      <div><small>Protein</small><strong>{(entry.protein ?? 0).toFixed(1)} g</strong></div>
      <div><small>Carbs</small><strong>{(entry.carbs ?? 0).toFixed(1)} g</strong></div>
      <div><small>Fat</small><strong>{(entry.fat ?? 0).toFixed(1)} g</strong></div>
    </div>
  );
}

function BadgeList({ values }: { values: string[] }) {
  return <div className="badge-row">{values.map((value) => <span className="badge outline" key={value}>{value}</span>)}</div>;
}

export function CalendarFoodDetail({ entry, onClose }: { entry: FoodEntry; onClose: () => void }) {
  const payload = payloadOf(entry);
  const isProduct = entry.provider === 'openfoodfacts' || entry.provider === 'manual';
  const ingredients = payload.ingredientLines ?? payload.ingredients ?? [];
  const labels = [...(payload.cuisine ?? []), ...(payload.dish ?? []), ...(payload.meal ?? []), ...(payload.diet ?? []), ...(payload.health ?? [])];

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  return (
    <div className="sheet-overlay" role="dialog" aria-modal="true" aria-label={`${entry.title} details`}>
      <article className="side-sheet calendar-entry-detail">
        <button className="sheet-close" aria-label="Close" onClick={onClose}><X /></button>
        <header><h2>{entry.title}</h2><p>{providerLabel(entry, payload)}</p></header>
        <div className="sheet-content">
          {entry.imageUrl
            ? <img className="calendar-entry-detail-image" src={entry.imageUrl} alt="" referrerPolicy="no-referrer" />
            : <div className="recipe-detail-placeholder">{isProduct ? <Barcode /> : <Utensils />}</div>}

          <div className="badge-row">
            <span className="badge solid">{titleCase(entry.mealType ?? 'dinner')}</span>
            <span className="badge outline">{quantityLabel(entry)}</span>
            {payload.minutes !== undefined && <span className="badge outline">{payload.minutes} min</span>}
          </div>

          {payload.description && <p>{payload.description}</p>}
          {labels.length > 0 && <BadgeList values={Array.from(new Set(labels))} />}

          <section><h3>Saved nutrition</h3><MacroGrid entry={entry} /></section>

          {isProduct && (
            <section className="calendar-product-facts">
              <h3>Product details</h3>
              <dl>
                {payload.brand && <div><dt>Brand</dt><dd>{payload.brand}</dd></div>}
                {payload.barcode && <div><dt>Barcode</dt><dd>{payload.barcode}</dd></div>}
                {payload.basis && <div><dt>Nutrition basis</dt><dd>{payload.basis}</dd></div>}
                <div><dt>Amount saved</dt><dd>{quantityLabel(entry)}</dd></div>
              </dl>
              {entry.provider === 'openfoodfacts' && payload.barcode && <a className="text-button calendar-source-link" href={`https://world.openfoodfacts.org/product/${payload.barcode}`} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open Food Facts</a>}
            </section>
          )}

          {!isProduct && ingredients.length > 0 && <section><h3>Ingredients</h3><ul className="ingredient-lines">{ingredients.map((ingredient, index) => <li key={`${index}-${ingredient}`}>{ingredient}</li>)}</ul></section>}
          {!isProduct && (payload.steps?.length ?? 0) > 0 && <section><h3>Instructions</h3><ol className="ingredient-lines numbered">{payload.steps?.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></section>}
          {!isProduct && (payload.cautions?.length ?? 0) > 0 && <section className="caution-panel"><h3>Cautions</h3><BadgeList values={payload.cautions ?? []} /></section>}
          {!isProduct && payload.url && <a className="text-button calendar-source-link" href={payload.url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Cooking instructions</a>}
        </div>
      </article>
    </div>
  );
}
