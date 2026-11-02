import type { MealType } from '../data/db';

const meals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function FoodScheduleGrid({
  date,
  meal,
  quantity,
  onDateChange,
  onMealChange,
  onQuantityChange,
  quantityLabel = 'Servings',
}: {
  date: string;
  meal: MealType;
  quantity: number;
  onDateChange: (value: string) => void;
  onMealChange: (value: MealType) => void;
  onQuantityChange: (value: number) => void;
  quantityLabel?: string;
}) {
  return (
    <div className="food-schedule-grid">
      <label>Date<input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} /></label>
      <label>Meal<select value={meal} onChange={(event) => onMealChange(event.target.value as MealType)}>{meals.map((item) => <option value={item} key={item}>{titleCase(item)}</option>)}</select></label>
      <label>{quantityLabel}<input type="number" min="0.25" step="0.25" value={quantity} onChange={(event) => onQuantityChange(Number(event.target.value))} /></label>
    </div>
  );
}
