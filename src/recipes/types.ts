export type RecipeNutrition = { calories: number; protein: number; carbs: number; fat: number };
export type RecipeFacet = { value: string; count: number };

export type RecipeSummary = {
  id: string;
  title: string;
  source: string;
  imageUrl: string;
  servings: number;
  nutrition: RecipeNutrition;
  cuisine: string[];
  dish: string[];
  meal: string[];
};

export type RecipeDetail = RecipeSummary & {
  url: string;
  diet: string[];
  health: string[];
  cautions: string[];
  ingredientLines: string[];
  nutrients: Record<string, { label: string; quantity: number; unit: string; dailyPercent: number | null }>;
};

export type RecipeFacets = {
  cuisines: RecipeFacet[];
  dishTypes: RecipeFacet[];
  mealTypes: RecipeFacet[];
  dietLabels: RecipeFacet[];
  healthLabels: RecipeFacet[];
};

export type RecipePage = {
  items: RecipeSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: RecipeFacets;
};
