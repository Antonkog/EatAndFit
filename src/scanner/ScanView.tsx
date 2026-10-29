import {
  AlertTriangle,
  Barcode,
  Camera,
  Images,
  Keyboard,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  ScanLine,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { localDate, saveFood, saveProduct, type MealType } from '../data/db';
import { prepareJpeg } from './image';

export type ScanMode = 'photo' | 'barcode';
type Product = { barcode: string; name: string; brand: string; imageUrl: string; calories?: number; protein?: number; carbs?: number; fat?: number; basis: string };
const meals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }

export function ScanView({
  initialDate = localDate(),
  initialMode = 'photo',
  onAdded,
  onOpenAi,
  onChooseRecipes,
}: {
  initialDate?: string;
  initialMode?: ScanMode;
  onAdded: (date: string) => void;
  onOpenAi: (ingredients: string[]) => void;
  onChooseRecipes: (ingredients: string[]) => void;
}) {
  const [mode, setMode] = useState<ScanMode>(initialMode);
  return (
    <section className="scan-view">
      <div className="scan-heading"><p className="eyebrow">Photo and barcode tools</p><h1>Scan</h1><p>Recognize ingredients from a photo or scan a packaged product barcode.</p></div>
      <fieldset className="scan-type"><legend>Scan type</legend><div>
        <ModeRadio active={mode === 'photo'} name="scan-type" value="photo" icon={<Camera />} title="Photo" hint="Recognize ingredients" onClick={() => setMode('photo')} />
        <ModeRadio active={mode === 'barcode'} name="scan-type" value="barcode" icon={<Barcode />} title="Barcode" hint="Find a packaged product" onClick={() => setMode('barcode')} />
      </div></fieldset>
      {mode === 'photo' ? (
        <IngredientScannerPanel onConfirm={onOpenAi} onChooseRecipes={onChooseRecipes} />
      ) : (
        <ProductScanner initialDate={initialDate} onAdded={onAdded} onUseInRecipe={(name) => onOpenAi([name])} />
      )}
    </section>
  );
}

function ModeRadio({ active, name, value, icon, title, hint, onClick }: { active: boolean; name: string; value: string; icon: React.ReactNode; title: string; hint: string; onClick: () => void }) {
  const id = `${name}-${value}`;
  return <label className={active ? 'active' : ''} htmlFor={id}><input id={id} type="radio" name={name} value={value} checked={active} onChange={onClick} /><span><strong>{icon}{title}</strong><small>{hint}</small></span></label>;
}

export function IngredientScannerTrigger({ currentIngredients, onConfirm }: { currentIngredients: string[]; onConfirm: (ingredients: string[]) => void }) {
  const [open, setOpen] = useState(false);
  return <><button className="primary-button large full" type="button" onClick={() => setOpen(true)}><ScanLine size={18} /> Scan ingredients</button>{open && <div className="sheet-overlay" role="dialog" aria-modal="true" aria-label="Ingredient scanner"><article className="side-sheet ingredient-sheet"><button className="sheet-close" onClick={() => setOpen(false)} aria-label="Close"><X /></button><header><h2>Ingredient scanner</h2><p>Take one clear photo, review the labels, then add the valid ingredients to the recipe form.</p></header><IngredientScannerPanel currentIngredients={currentIngredients} onConfirm={(items) => { onConfirm(items); setOpen(false); }} /></article></div>}</>;
}

function IngredientScannerPanel({
  currentIngredients = [],
  onConfirm,
  onChooseRecipes,
}: {
  currentIngredients?: string[];
  onConfirm: (ingredients: string[]) => void;
  onChooseRecipes?: (ingredients: string[]) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [scanning, setScanning] = useState(false);
  const preview = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = (selected?: File) => {
    if (!selected) return;
    setFile(selected);
    setIngredients([]);
    setStatus('');
  };

  const scan = async () => {
    if (!file) return;
    setScanning(true);
    setStatus('Recognizing ingredients…');
    try {
      const image = await prepareJpeg(file);
      const response = await fetch('/api/ai/ingredients/detect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Recognition failed.');
      setIngredients(data.ingredients ?? []);
      setStatus((data.ingredients ?? []).length ? 'Review every ingredient before continuing.' : 'No ingredients were recognized. Try another photo.');
    } catch (value) {
      setStatus(value instanceof Error ? value.message : 'Recognition failed.');
    } finally {
      setScanning(false);
    }
  };

  const add = () => {
    const value = draft.trim();
    if (value && !ingredients.some((item) => item.toLowerCase() === value.toLowerCase())) setIngredients((items) => [...items, value]);
    setDraft('');
  };
  const merged = [...new Set([...currentIngredients, ...ingredients].map((item) => item.trim()).filter(Boolean))];

  return (
    <section className="ingredient-scanner-card">
      <input ref={cameraRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => choose(event.target.files?.[0])} />
      <input ref={galleryRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => choose(event.target.files?.[0])} />
      {preview ? <div className="photo-preview"><img src={preview} alt="Ingredient preview" /><div><button className="text-button" onClick={() => cameraRef.current?.click()}><Camera size={17} /> Take photo</button><button className="text-button" onClick={() => galleryRef.current?.click()}><Images size={17} /> Choose photo</button></div><button className="primary-button full" disabled={scanning} onClick={() => void scan()}>{scanning ? <LoaderCircle className="spin" /> : <ScanLine size={17} />}{scanning ? 'Recognizing…' : 'Recognize ingredients'}</button></div> : <div className="photo-drop"><Camera /><button className="primary-button" onClick={() => cameraRef.current?.click()}><Camera size={17} /> Take photo</button><button className="text-button" onClick={() => galleryRef.current?.click()}><Images size={17} /> Choose photo</button></div>}
      {status && <p className="scanner-status">{status}</p>}
      <div className="ingredient-editor"><h3>Ingredients</h3>{ingredients.map((item, index) => <div key={`${item}-${index}`}><input value={item} onChange={(event) => setIngredients((values) => values.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /><button aria-label="Remove ingredient" onClick={() => setIngredients((values) => values.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button></div>)}<div className="add-ingredient"><input aria-label="Ingredient name" placeholder="Ingredient name" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} /><button className="text-button" onClick={add}><Plus size={16} /> Add</button></div></div>
      <footer className="ingredient-actions">{onChooseRecipes && <button className="text-button" disabled={!merged.length} onClick={() => onChooseRecipes(merged)}><Search size={17} /> Choose recipe</button>}<button className="primary-button" disabled={!merged.length} onClick={() => onConfirm(merged)}><Sparkles size={17} /> Generate AI recipe</button></footer>
    </section>
  );
}

function ProductScanner({ initialDate, onAdded, onUseInRecipe }: { initialDate: string; onAdded: (date: string) => void; onUseInRecipe: (name: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [barcode, setBarcode] = useState('');
  const [product, setProduct] = useState<Product>();
  const [manual, setManual] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [date, setDate] = useState(initialDate);
  const [meal, setMeal] = useState<MealType>('dinner');
  const [amount, setAmount] = useState(100);

  useEffect(() => {
    if (product || manual || !navigator.mediaDevices?.getUserMedia) return;
    let stream: MediaStream | undefined;
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then((value) => {
      stream = value;
      if (videoRef.current) videoRef.current.srcObject = value;
    }).catch(() => setCameraError('The camera could not be started. Allow camera access or enter the barcode manually.'));
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [manual, product]);

  const lookup = async () => {
    if (!/^\d{8,14}$/.test(barcode)) { setStatus('Enter 8 to 14 digits.'); return; }
    setLoading(true);
    setStatus('');
    try {
      const response = await fetch(`/api/products/${barcode}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'This product is not in Open Food Facts.');
      setProduct(data);
    } catch (value) {
      setStatus(value instanceof Error ? value.message : 'Product lookup failed.');
      setManual(true);
      setProduct({ barcode, name: '', brand: '', imageUrl: '', calories: 0, protein: 0, carbs: 0, fat: 0, basis: 'per 100 g' });
    } finally { setLoading(false); }
  };

  const updateProduct = (key: keyof Product, value: string | number) => setProduct((item) => item ? { ...item, [key]: value } : item);
  const calculated = product ? { calories: (product.calories ?? 0) * amount / 100, protein: (product.protein ?? 0) * amount / 100, carbs: (product.carbs ?? 0) * amount / 100, fat: (product.fat ?? 0) * amount / 100 } : undefined;
  const save = async () => {
    if (!product?.name.trim()) { setStatus('Enter a product name.'); return; }
    await saveProduct(product);
    await saveFood({ id: crypto.randomUUID(), date, title: product.name, provider: manual ? 'manual' : 'openfoodfacts', mealType: meal, quantity: amount, quantityUnit: 'g', imageUrl: product.imageUrl, ...calculated, payload: product });
    onAdded(date);
  };
  const reset = () => { setProduct(undefined); setManual(false); setBarcode(''); setStatus(''); };

  return (
    <section className="product-scanner">
      {!product ? <div className="barcode-start"><div className="camera-frame"><video ref={videoRef} muted autoPlay playsInline aria-label="Camera" /><span /><p>Keep the barcode inside the frame.</p></div><div className="manual-barcode"><header><span><Keyboard /></span><h2>Enter barcode manually</h2></header><label>Barcode<input value={barcode} inputMode="numeric" maxLength={14} onChange={(event) => setBarcode(event.target.value.replace(/\D/g, '').slice(0, 14))} /></label><button className="primary-button full" disabled={loading} onClick={() => void lookup()}>{loading ? <LoaderCircle className="spin" /> : <Barcode size={17} />} Find product</button>{cameraError && <p className="camera-error"><AlertTriangle size={16} /> {cameraError}</p>}</div></div> : <div className="product-editor"><section><div className="product-summary">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span><Barcode /></span>}<div><small>{manual ? 'Locally saved product' : barcode}</small>{manual ? <><label>Product name<input value={product.name} onChange={(event) => updateProduct('name', event.target.value)} /></label><label>Brand (optional)<input value={product.brand} onChange={(event) => updateProduct('brand', event.target.value)} /></label></> : <><h2>{product.name}</h2><p>{product.brand}</p></>}</div></div>{manual && <div className="manual-nutrition"><h3>Nutrition per 100 g</h3><div>{(['calories', 'protein', 'carbs', 'fat'] as const).map((key) => <label key={key}>{titleCase(key)}<input type="number" min="0" step="0.1" value={product[key] ?? 0} onChange={(event) => updateProduct(key, Number(event.target.value))} /></label>)}</div></div>}<MacroGrid values={{ calories: product.calories ?? 0, protein: product.protein ?? 0, carbs: product.carbs ?? 0, fat: product.fat ?? 0 }} /></section><section className="product-log-panel"><div className="four-fields"><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value as MealType)}>{meals.map((item) => <option value={item} key={item}>{titleCase(item)}</option>)}</select></label><label>Amount<input type="number" min="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label><label>Unit<select><option>g</option></select></label></div>{calculated && <><h3>For this amount</h3><MacroGrid values={calculated} /></>}<div className="product-actions"><button className="primary-button" onClick={() => void save()}><Save size={17} /> Add product</button><button className="text-button" onClick={() => onUseInRecipe(product.name)}><Sparkles size={17} /> Add ingredient to recipe</button><button className="text-button" onClick={reset}><RefreshCw size={17} /> Scan another product</button></div></section>{!manual && <p className="data-attribution">Product data and image are provided by <a href={`https://world.openfoodfacts.org/product/${barcode}`} target="_blank" rel="noreferrer">Open Food Facts</a>.</p>}</div>}
      {status && <p className="notice">{status}</p>}
    </section>
  );
}

function MacroGrid({ values }: { values: { calories: number; protein: number; carbs: number; fat: number } }) {
  return <div className="macro-grid"><div><small>Calories</small><strong>{values.calories.toFixed(0)} kcal</strong></div><div><small>Protein</small><strong>{values.protein.toFixed(1)} g</strong></div><div><small>Carbs</small><strong>{values.carbs.toFixed(1)} g</strong></div><div><small>Fat</small><strong>{values.fat.toFixed(1)} g</strong></div></div>;
}
