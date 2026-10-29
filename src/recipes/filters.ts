export function recipeSearchParams(values: Record<string, string>) { const params = new URLSearchParams(); for (const [key, value] of Object.entries(values)) if (value.trim()) params.set(key, value.trim()); return params; }

