export type WorkoutSet = { id: string; reps: number; weightKg: number; durationSeconds?: number; complete: boolean };
export type Workout = { id: string; date: string; exerciseId: string; exerciseName: string; sets: WorkoutSet[]; notes: string; completed: boolean; caloriesBurned?: number; calorieSource?: string };
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodEntry = { id: string; date: string; title: string; calories?: number; protein?: number; carbs?: number; fat?: number; provider: string; mealType?: MealType; quantity?: number; quantityUnit?: 'serving' | 'g' | 'ml'; imageUrl?: string; payload?: unknown };
export type LocalProduct = { barcode: string; name: string; calories?: number; protein?: number; carbs?: number; fat?: number };
export type Backup = { schemaVersion: 1; exportedAt: string; workouts: Workout[]; food: FoodEntry[]; products: LocalProduct[] };

const DATABASE = 'eat-and-fit';
const VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('workouts')) db.createObjectStore('workouts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('food')) db.createObjectStore('food', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'barcode' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function all<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  const result = await requestResult(db.transaction(storeName).objectStore(storeName).getAll()) as T[];
  db.close();
  return result;
}

async function put<T>(storeName: string, value: T) {
  const db = await openDatabase();
  await requestResult(db.transaction(storeName, 'readwrite').objectStore(storeName).put(value));
  db.close();
}

export function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export async function workoutsForDate(date: string) {
  return (await all<Workout>('workouts')).filter((item) => item.date === date).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}

export async function allWorkouts() { return all<Workout>('workouts'); }
export async function allFood() { return all<FoodEntry>('food'); }

export async function scheduleWorkout(exerciseId: string, exerciseName: string, date = localDate()) {
  const workout: Workout = { id: crypto.randomUUID(), date, exerciseId, exerciseName, notes: '', completed: false, sets: [{ id: crypto.randomUUID(), reps: 10, weightKg: 0, complete: false }] };
  await put('workouts', workout);
  window.dispatchEvent(new Event('eatfit-data-change'));
  return workout;
}

export async function saveWorkout(workout: Workout) {
  await put('workouts', workout);
  window.dispatchEvent(new Event('eatfit-data-change'));
}

export async function removeWorkout(id: string) {
  const db = await openDatabase();
  await requestResult(db.transaction('workouts', 'readwrite').objectStore('workouts').delete(id));
  db.close();
  window.dispatchEvent(new Event('eatfit-data-change'));
}

export async function saveFood(entry: FoodEntry) { await put('food', entry); window.dispatchEvent(new Event('eatfit-data-change')); }
export async function foodForDate(date: string) { return (await all<FoodEntry>('food')).filter((item) => item.date === date); }
export async function removeFood(id: string) {
  const db = await openDatabase();
  await requestResult(db.transaction('food', 'readwrite').objectStore('food').delete(id));
  db.close();
  window.dispatchEvent(new Event('eatfit-data-change'));
}
export async function saveProduct(product: LocalProduct) { await put('products', product); }
export async function getProduct(barcode: string) { const db = await openDatabase(); const result = await requestResult(db.transaction('products').objectStore('products').get(barcode)); db.close(); return result as LocalProduct | undefined; }

export async function exportBackup(): Promise<Backup> {
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), workouts: await all('workouts'), food: await all('food'), products: await all('products') };
}

export function isBackup(value: unknown): value is Backup {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Backup>;
  return item.schemaVersion === 1 && Array.isArray(item.workouts) && Array.isArray(item.food) && Array.isArray(item.products);
}

export async function importBackup(backup: Backup) {
  if (!isBackup(backup)) throw new Error('This is not a valid Eat & Fit backup.');
  await clearData();
  for (const item of backup.workouts) await put('workouts', item);
  for (const item of backup.food) await put('food', item);
  for (const item of backup.products) await put('products', item);
  window.dispatchEvent(new Event('eatfit-data-change'));
}

export async function clearData() {
  const db = await openDatabase();
  const transaction = db.transaction(['workouts', 'food', 'products'], 'readwrite');
  transaction.objectStore('workouts').clear(); transaction.objectStore('food').clear(); transaction.objectStore('products').clear();
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  db.close();
}

