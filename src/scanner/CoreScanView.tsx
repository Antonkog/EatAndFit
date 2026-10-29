import { localDate } from '../data/db';
import { ProductScanner } from './ProductScanner';

export function CoreScanView({
  initialDate = localDate(),
  onAdded,
  onChooseRecipes,
}: {
  initialDate?: string;
  onAdded: (date: string) => void;
  onChooseRecipes: (ingredients: string[]) => void;
}) {
  return (
    <section className="scan-view">
      <div className="scan-heading"><p className="eyebrow">Packaged food tool</p><h1>Scan</h1><p>Scan a packaged product barcode or enter it manually.</p></div>
      <ProductScanner initialDate={initialDate} onAdded={onAdded} onUseInRecipe={(name) => onChooseRecipes([name])} />
    </section>
  );
}
