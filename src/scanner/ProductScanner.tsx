import {
  AlertTriangle,
  Barcode,
  Keyboard,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { saveFood, saveProduct, type MealType } from '../data/db';

type Product = {
  barcode: string;
  name: string;
  brand: string;
  imageUrl: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  basis: string;
};

const meals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function normalizeScannedBarcode(value: string) {
  const code = value.replace(/\D/g, '');
  return /^\d{8,14}$/.test(code) ? code : undefined;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ProductScanner({ initialDate, onAdded, onUseInRecipe }: {
  initialDate: string;
  onAdded: (date: string) => void;
  onUseInRecipe: (name: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControls = useRef<{ stop: () => void } | undefined>(undefined);
  const detectionHandled = useRef(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [barcode, setBarcode] = useState('');
  const [product, setProduct] = useState<Product>();
  const [manual, setManual] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [date, setDate] = useState(initialDate);
  const [meal, setMeal] = useState<MealType>('dinner');
  const [amount, setAmount] = useState(100);

  const stopCamera = useCallback(() => {
    scannerControls.current?.stop();
    scannerControls.current = undefined;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const lookup = useCallback(async (rawBarcode: string) => {
    const code = normalizeScannedBarcode(rawBarcode);
    if (!code) {
      setStatus('Enter 8 to 14 digits.');
      return;
    }
    setBarcode(code);
    stopCamera();
    setLoading(true);
    setStatus('');
    try {
      const response = await fetch(`/api/products/${code}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'This product is not in Open Food Facts.');
      setProduct(data);
    } catch (value) {
      setStatus(value instanceof Error ? value.message : 'Product lookup failed.');
      setManual(true);
      setProduct({ barcode: code, name: '', brand: '', imageUrl: '', calories: 0, protein: 0, carbs: 0, fat: 0, basis: 'per 100 g' });
    } finally {
      setLoading(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    if (product || manual || loading) return;
    if (!window.isSecureContext) {
      setCameraError('Camera scanning requires HTTPS or localhost. You can still enter the barcode manually.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera scanning is not available in this browser. You can still enter the barcode manually.');
      return;
    }
    let active = true;
    detectionHandled.current = false;
    setCameraError('');
    void import('@zxing/browser')
      .then(async ({ BarcodeFormat, BrowserMultiFormatReader }) => {
        if (!active || !videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        reader.possibleFormats = [BarcodeFormat.EAN_8, BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF];
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current,
          (result) => {
            if (!active || detectionHandled.current || !result) return;
            const code = normalizeScannedBarcode(result.getText());
            if (!code) return;
            detectionHandled.current = true;
            navigator.vibrate?.(80);
            scannerControls.current?.stop();
            void lookup(code);
          },
        );
        if (!active) controls.stop();
        else scannerControls.current = controls;
      })
      .catch(() => {
        if (active) setCameraError('The camera could not be started. Allow camera access or enter the barcode manually.');
      });
    return () => {
      active = false;
      stopCamera();
    };
  }, [cameraKey, loading, lookup, manual, product, stopCamera]);

  useEffect(() => {
    const handleVisibility = () => { if (document.hidden) stopCamera(); };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [stopCamera]);

  const updateProduct = (key: keyof Product, value: string | number) => setProduct((item) => item ? { ...item, [key]: value } : item);
  const calculated = product ? {
    calories: (product.calories ?? 0) * amount / 100,
    protein: (product.protein ?? 0) * amount / 100,
    carbs: (product.carbs ?? 0) * amount / 100,
    fat: (product.fat ?? 0) * amount / 100,
  } : undefined;

  const save = async () => {
    if (!product?.name.trim()) {
      setStatus('Enter a product name.');
      return;
    }
    await saveProduct(product);
    await saveFood({
      id: crypto.randomUUID(),
      date,
      title: product.name,
      provider: manual ? 'manual' : 'openfoodfacts',
      mealType: meal,
      quantity: amount,
      quantityUnit: 'g',
      imageUrl: product.imageUrl,
      ...calculated,
      payload: product,
    });
    onAdded(date);
  };

  const reset = () => {
    stopCamera();
    setProduct(undefined);
    setManual(false);
    setBarcode('');
    setStatus('');
    setCameraError('');
    setCameraKey((value) => value + 1);
  };

  return (
    <section className="product-scanner">
      {!product ? (
        <div className="barcode-start">
          <div className="camera-frame"><video ref={videoRef} muted autoPlay playsInline aria-label="Camera" /><span /><p>Keep the barcode inside the frame.</p></div>
          <div className="manual-barcode">
            <header><span><Keyboard /></span><h2>Enter barcode manually</h2></header>
            <label>Barcode<input value={barcode} inputMode="numeric" maxLength={14} onChange={(event) => setBarcode(event.target.value.replace(/\D/g, '').slice(0, 14))} /></label>
            <button className="primary-button full" disabled={loading} onClick={() => void lookup(barcode)}>{loading ? <LoaderCircle className="spin" /> : <Barcode size={17} />} Find product</button>
            {cameraError && <div className="camera-error"><span><AlertTriangle size={16} /> {cameraError}</span><button className="text-button" onClick={() => { stopCamera(); setCameraError(''); setCameraKey((value) => value + 1); }}>Retry camera</button></div>}
          </div>
        </div>
      ) : (
        <div className="product-editor">
          <section>
            <div className="product-summary">
              {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span><Barcode /></span>}
              <div>
                <small>{manual ? 'Locally saved product' : barcode}</small>
                {manual ? <><label>Product name<input value={product.name} onChange={(event) => updateProduct('name', event.target.value)} /></label><label>Brand (optional)<input value={product.brand} onChange={(event) => updateProduct('brand', event.target.value)} /></label></> : <><h2>{product.name}</h2><p>{product.brand}</p></>}
              </div>
            </div>
            {manual && <div className="manual-nutrition"><h3>Nutrition per 100 g</h3><div>{(['calories', 'protein', 'carbs', 'fat'] as const).map((key) => <label key={key}>{titleCase(key)}<input type="number" min="0" step="0.1" value={product[key] ?? 0} onChange={(event) => updateProduct(key, Number(event.target.value))} /></label>)}</div></div>}
            <MacroGrid values={{ calories: product.calories ?? 0, protein: product.protein ?? 0, carbs: product.carbs ?? 0, fat: product.fat ?? 0 }} />
          </section>
          <section className="product-log-panel">
            <div className="four-fields">
              <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value as MealType)}>{meals.map((item) => <option value={item} key={item}>{titleCase(item)}</option>)}</select></label>
              <label>Amount<input type="number" min="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>
              <label>Unit<select><option>g</option></select></label>
            </div>
            {calculated && <><h3>For this amount</h3><MacroGrid values={calculated} /></>}
            <div className="product-actions">
              <button className="primary-button" onClick={() => void save()}><Save size={17} /> Add product</button>
              <button className="text-button" onClick={() => onUseInRecipe(product.name)}><Search size={17} /> Find recipes with this product</button>
              <button className="text-button" onClick={reset}><RefreshCw size={17} /> Scan another product</button>
            </div>
          </section>
          {!manual && <p className="data-attribution">Product data and image are provided by <a href={`https://world.openfoodfacts.org/product/${barcode}`} target="_blank" rel="noreferrer">Open Food Facts</a>.</p>}
        </div>
      )}
      {status && <p className="notice">{status}</p>}
    </section>
  );
}

function MacroGrid({ values }: { values: { calories: number; protein: number; carbs: number; fat: number } }) {
  return <div className="macro-grid"><div><small>Calories</small><strong>{values.calories.toFixed(0)} kcal</strong></div><div><small>Protein</small><strong>{values.protein.toFixed(1)} g</strong></div><div><small>Carbs</small><strong>{values.carbs.toFixed(1)} g</strong></div><div><small>Fat</small><strong>{values.fat.toFixed(1)} g</strong></div></div>;
}
