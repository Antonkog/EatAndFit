import {
  Barcode,
  Camera,
  Images,
  KeyRound,
  LoaderCircle,
  Plus,
  ScanLine,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { readJsonResponse } from '../api/readJsonResponse';
import { localDate } from '../data/db';
import { getRecognitionCredential, getRecognitionKeyStatus, RECOGNITION_KEYS_CHANGED } from '../settings/secureKeys';
import { prepareJpeg } from './image';
import { ProductScanner } from './ProductScanner';
import type { ScanMode } from './types';

export function ScanView({
  initialDate = localDate(),
  initialMode = 'photo',
  onAdded,
  onChooseRecipes,
  onOpenAi,
  onOpenSettings,
}: {
  initialDate?: string;
  initialMode?: ScanMode;
  onAdded: (date: string) => void;
  onChooseRecipes: (ingredients: string[]) => void;
  onOpenAi: (ingredients: string[]) => void;
  onOpenSettings: () => void;
}) {
  const [mode, setMode] = useState<ScanMode>(initialMode);
  const [smartEnabled, setSmartEnabled] = useState<boolean>();
  useEffect(() => {
    const refresh = () => void getRecognitionKeyStatus().then((value) => setSmartEnabled(
      value.activeProvider === 'META' ? value.metaConfigured : value.geminiConfigured,
    )).catch(() => setSmartEnabled(false));
    refresh();
    window.addEventListener(RECOGNITION_KEYS_CHANGED, refresh);
    return () => window.removeEventListener(RECOGNITION_KEYS_CHANGED, refresh);
  }, []);
  useEffect(() => { if (smartEnabled === false && mode === 'photo') setMode('barcode'); }, [mode, smartEnabled]);
  if (smartEnabled === undefined) return <div className="loading-state"><LoaderCircle className="spin" /></div>;
  return (
    <section className="scan-view">
      <div className="scan-heading"><p className="eyebrow">{smartEnabled ? 'Photo and barcode tools' : 'Packaged food tool'}</p><h1>Scan</h1><p>{smartEnabled ? 'Recognize ingredients from a photo or scan a packaged product barcode.' : 'Scan a packaged product barcode or enter it manually.'}</p></div>
      <fieldset className="scan-type"><legend>Scan type</legend><div>
        {smartEnabled && <ModeRadio active={mode === 'photo'} name="scan-type" value="photo" icon={<Camera />} title="Photo" hint="Recognize ingredients" onClick={() => setMode('photo')} />}
        <ModeRadio active={mode === 'barcode'} name="scan-type" value="barcode" icon={<Barcode />} title="Barcode" hint="Find a packaged product" onClick={() => setMode('barcode')} />
      </div></fieldset>
      {smartEnabled && mode === 'photo' ? (
        <IngredientScannerPanel onChooseRecipes={onChooseRecipes} onOpenAi={onOpenAi} onOpenSettings={onOpenSettings} />
      ) : (
        <ProductScanner initialDate={initialDate} onAdded={onAdded} onUseInRecipe={(name) => onChooseRecipes([name])} />
      )}
    </section>
  );
}

export function IngredientScannerTrigger({
  currentIngredients,
  onConfirm,
  onOpenSettings,
}: {
  currentIngredients: string[];
  onConfirm: (ingredients: string[]) => void;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <><button className="primary-button large full" type="button" onClick={() => setOpen(true)}><ScanLine size={18} /> Recognize ingredients</button>{open && <div className="sheet-overlay" role="dialog" aria-modal="true" aria-label="Ingredient scanner"><article className="side-sheet ingredient-sheet"><button className="sheet-close" onClick={() => setOpen(false)} aria-label="Close"><X /></button><header><h2>Ingredient scanner</h2><p>Take one clear photo, review the labels, then add the valid ingredients to the recipe form.</p></header><IngredientScannerPanel currentIngredients={currentIngredients} onConfirm={(items) => { onConfirm(items); setOpen(false); }} onOpenSettings={onOpenSettings} /></article></div>}</>;
}

function ModeRadio({ active, name, value, icon, title, hint, onClick }: { active: boolean; name: string; value: string; icon: React.ReactNode; title: string; hint: string; onClick: () => void }) {
  const id = `${name}-${value}`;
  return <label className={active ? 'active' : ''} htmlFor={id}><input id={id} type="radio" name={name} value={value} checked={active} onChange={onClick} /><span><strong>{icon}{title}</strong><small>{hint}</small></span></label>;
}

function IngredientScannerPanel({
  currentIngredients = [],
  onConfirm,
  onChooseRecipes,
  onOpenAi,
  onOpenSettings,
}: {
  currentIngredients?: string[];
  onConfirm?: (ingredients: string[]) => void;
  onChooseRecipes?: (ingredients: string[]) => void;
  onOpenAi?: (ingredients: string[]) => void;
  onOpenSettings: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [scanning, setScanning] = useState(false);
  const [credential, setCredential] = useState<{ configured: boolean; provider: string }>();
  const preview = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    const refresh = () => void getRecognitionKeyStatus().then((value) => setCredential({
      configured: value.activeProvider === 'META' ? value.metaConfigured : value.geminiConfigured,
      provider: value.activeProvider === 'META' ? 'Meta' : 'Google Gemini',
    })).catch(() => setCredential({ configured: false, provider: 'Meta or Google Gemini' }));
    refresh();
    window.addEventListener(RECOGNITION_KEYS_CHANGED, refresh);
    return () => window.removeEventListener(RECOGNITION_KEYS_CHANGED, refresh);
  }, []);

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
      const recognition = await getRecognitionCredential();
      if (!recognition) throw new Error('Add a Meta or Google Gemini API key in Settings first.');
      const image = await prepareJpeg(file);
      const response = await fetch('/api/ai/ingredients/detect', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${recognition.apiKey}`,
          'content-type': 'application/json',
          'x-recognition-provider': recognition.provider,
        },
        body: JSON.stringify({ image }),
      });
      const data = await readJsonResponse<{ error?: string; ingredients?: string[] }>(response, 'Ingredient recognition');
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

  if (!credential) return <section className="ingredient-scanner-card scanner-setup"><LoaderCircle className="spin" /><p>Checking Smart Scan settings…</p></section>;
  if (!credential.configured) return (
    <section className="ingredient-scanner-card scanner-setup">
      <span><KeyRound /></span>
      <h2>Add your API key to use Smart Scan</h2>
      <p>The key is encrypted and stored only in this browser. Configure Meta or Google Gemini in Settings.</p>
      <button className="primary-button" onClick={onOpenSettings}><KeyRound size={17} /> Open settings</button>
    </section>
  );

  return (
    <section className="ingredient-scanner-card">
      <input ref={cameraRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => choose(event.target.files?.[0])} />
      <input ref={galleryRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => choose(event.target.files?.[0])} />
      {preview ? <div className="photo-preview"><img src={preview} alt="Ingredient preview" /><div><button className="text-button" onClick={() => cameraRef.current?.click()}><Camera size={17} /> Take photo</button><button className="text-button" onClick={() => galleryRef.current?.click()}><Images size={17} /> Choose photo</button></div><button className="primary-button full" disabled={scanning} onClick={() => void scan()}>{scanning ? <LoaderCircle className="spin" /> : <ScanLine size={17} />}{scanning ? 'Recognizing…' : 'Recognize ingredients'}</button></div> : <div className="photo-drop"><Camera /><button className="primary-button" onClick={() => cameraRef.current?.click()}><Camera size={17} /> Take photo</button><button className="text-button" onClick={() => galleryRef.current?.click()}><Images size={17} /> Choose photo</button></div>}
      {status && <p className="scanner-status">{status}</p>}
      <div className="ingredient-editor"><h3>Ingredients</h3>{ingredients.map((item, index) => <div key={`${item}-${index}`}><input value={item} onChange={(event) => setIngredients((values) => values.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} /><button aria-label="Remove ingredient" onClick={() => setIngredients((values) => values.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button></div>)}<div className="add-ingredient"><input aria-label="Ingredient name" placeholder="Ingredient name" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} /><button className="text-button" onClick={add}><Plus size={16} /> Add</button></div></div>
      <p className="scanner-provider">Using {credential.provider}. Review every recognized item before searching recipes.</p>
      <footer className="ingredient-actions">
        {onConfirm && <button className="primary-button" disabled={!merged.length} onClick={() => onConfirm(merged)}><Plus size={17} /> Use ingredients</button>}
        {onOpenAi && <button className="primary-button" disabled={!merged.length} onClick={() => onOpenAi(merged)}><Sparkles size={17} /> Generate AI recipe</button>}
        {onChooseRecipes && <button className="text-button" disabled={!merged.length} onClick={() => onChooseRecipes(merged)}><Search size={17} /> Find matching recipes</button>}
      </footer>
    </section>
  );
}
