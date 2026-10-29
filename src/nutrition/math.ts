export type NutrientValue = { name: string; unit: string; amountPer100g: number };
export function scaleNutrients(values: NutrientValue[], grams: number) { const factor = Math.max(0, grams) / 100; return values.map((item) => ({ ...item, amount: item.amountPer100g * factor })); }

