export function recipeSearchParams(values: Record<string, string>, ingredients: string[] = []) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value.trim()) params.set(key, value.trim());
  for (const ingredient of ingredients.map((item) => item.trim()).filter(Boolean)) params.append('ingredient', ingredient);
  return params;
}

