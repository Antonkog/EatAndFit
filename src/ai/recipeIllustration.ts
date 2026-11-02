import type { AiRecipe } from './validation';

export type RecipeIllustrationCategory =
  | 'breakfast'
  | 'soup'
  | 'salad'
  | 'sandwich-wrap'
  | 'meat-main-course'
  | 'fish-seafood-main-course'
  | 'vegetarian-vegan-main-course'
  | 'pasta-noodles'
  | 'rice-grain-bowl'
  | 'side-dish'
  | 'dessert'
  | 'snack'
  | 'cocktail';

export type RecipeIllustration = {
  category: RecipeIllustrationCategory;
  src: string;
  alt: string;
};

const illustrations: Record<RecipeIllustrationCategory, RecipeIllustration> = {
  breakfast: { category: 'breakfast', src: '/recipe-illustrations/breakfast.jpg', alt: 'Breakfast illustration' },
  soup: { category: 'soup', src: '/recipe-illustrations/soup.jpg', alt: 'Soup illustration' },
  salad: { category: 'salad', src: '/recipe-illustrations/salad.jpg', alt: 'Salad illustration' },
  'sandwich-wrap': { category: 'sandwich-wrap', src: '/recipe-illustrations/sandwich-wrap.jpg', alt: 'Sandwich or wrap illustration' },
  'meat-main-course': { category: 'meat-main-course', src: '/recipe-illustrations/meat-main-course.jpg', alt: 'Meat main course illustration' },
  'fish-seafood-main-course': { category: 'fish-seafood-main-course', src: '/recipe-illustrations/fish-seafood-main-course.jpg', alt: 'Fish or seafood main course illustration' },
  'vegetarian-vegan-main-course': { category: 'vegetarian-vegan-main-course', src: '/recipe-illustrations/vegetarian-vegan-main-course.jpg', alt: 'Vegetarian or vegan main course illustration' },
  'pasta-noodles': { category: 'pasta-noodles', src: '/recipe-illustrations/pasta-noodles.jpg', alt: 'Pasta or noodles illustration' },
  'rice-grain-bowl': { category: 'rice-grain-bowl', src: '/recipe-illustrations/rice-grain-bowl.jpg', alt: 'Rice, grain, or bowl illustration' },
  'side-dish': { category: 'side-dish', src: '/recipe-illustrations/side-dish.jpg', alt: 'Side dish illustration' },
  dessert: { category: 'dessert', src: '/recipe-illustrations/dessert.jpg', alt: 'Dessert illustration' },
  snack: { category: 'snack', src: '/recipe-illustrations/snack.jpg', alt: 'Snack illustration' },
  cocktail: { category: 'cocktail', src: '/recipe-illustrations/cocktail.jpg', alt: 'Drink illustration' },
};

const directDishTypes: Record<string, RecipeIllustrationCategory> = {
  soup: 'soup',
  salad: 'salad',
  sandwich: 'sandwich-wrap',
  dessert: 'dessert',
  'side dish': 'side-dish',
};

const directMealTypes: Record<string, RecipeIllustrationCategory> = {
  breakfast: 'breakfast',
  snack: 'snack',
};

const keywords: Record<RecipeIllustrationCategory, string[]> = {
  breakfast: ['breakfast', 'oatmeal', 'porridge', 'pancake', 'waffle', 'omelet', 'omelette', 'granola', 'frittata', 'morning toast'],
  soup: ['soup', 'stew', 'chowder', 'bisque', 'broth', 'gazpacho'],
  salad: ['salad', 'slaw', 'tabbouleh', 'tabouli'],
  'sandwich-wrap': ['sandwich', 'wrap', 'burger', 'burrito', 'taco', 'panini', 'quesadilla'],
  'meat-main-course': ['chicken', 'beef', 'pork', 'turkey', 'lamb', 'steak', 'meatball', 'sausage', 'veal', 'duck'],
  'fish-seafood-main-course': ['fish', 'seafood', 'salmon', 'tuna', 'cod', 'trout', 'shrimp', 'prawn', 'tilapia', 'sardine', 'mackerel', 'crab', 'lobster', 'squid'],
  'vegetarian-vegan-main-course': ['vegetarian', 'vegan', 'tofu', 'tempeh', 'lentil', 'chickpea', 'bean', 'vegetable', 'mushroom'],
  'pasta-noodles': ['pasta', 'spaghetti', 'noodle', 'linguine', 'penne', 'ravioli', 'lasagna', 'macaroni', 'ramen', 'soba', 'udon', 'tagliatelle'],
  'rice-grain-bowl': ['rice', 'quinoa', 'couscous', 'grain bowl', 'buddha bowl', 'barley', 'farro', 'risotto', 'pilaf'],
  'side-dish': ['side dish', 'side salad', 'roasted vegetables', 'mashed potato', 'fries'],
  dessert: ['dessert', 'cake', 'cookie', 'brownie', 'pudding', 'mousse', 'pie', 'tart', 'cheesecake', 'ice cream', 'sorbet'],
  snack: ['snack', 'energy bite', 'protein bite', 'trail mix', 'crackers', 'popcorn'],
  cocktail: ['cocktail', 'mocktail', 'smoothie', 'shake', 'juice', 'beverage', 'drink', 'lemonade'],
};

const titlePriority: RecipeIllustrationCategory[] = [
  'soup',
  'salad',
  'sandwich-wrap',
  'pasta-noodles',
  'rice-grain-bowl',
  'breakfast',
  'dessert',
  'snack',
  'cocktail',
  'fish-seafood-main-course',
  'meat-main-course',
  'vegetarian-vegan-main-course',
  'side-dish',
];

function normalize(value: string) {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

function includesKeyword(value: string, keyword: string) {
  return value.includes(` ${normalize(keyword).trim()} `);
}

function firstTitleMatch(title: string) {
  const normalizedTitle = normalize(title);
  return titlePriority.find((category) => keywords[category].some((keyword) => includesKeyword(normalizedTitle, keyword)));
}

function bodyMatch(recipe: AiRecipe) {
  const normalizedBody = normalize(`${recipe.description} ${recipe.ingredients.join(' ')}`);
  const scores = titlePriority.map((category) => ({
    category,
    score: keywords[category].filter((keyword) => includesKeyword(normalizedBody, keyword)).length,
  })).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score);

  if (!scores.length || (scores[1] && scores[0].score === scores[1].score)) return undefined;
  return scores[0].category;
}

export function classifyRecipeIllustration(
  recipe: AiRecipe,
  hints: { dishType?: string; mealType?: string } = {},
): RecipeIllustrationCategory | undefined {
  const dishCategory = directDishTypes[hints.dishType?.trim().toLowerCase() ?? ''];
  if (dishCategory) return dishCategory;
  const mealCategory = directMealTypes[hints.mealType?.trim().toLowerCase() ?? ''];
  if (mealCategory) return mealCategory;

  return firstTitleMatch(recipe.title) ?? bodyMatch(recipe);
}

export function getRecipeIllustration(category?: RecipeIllustrationCategory) {
  return category ? illustrations[category] : undefined;
}
