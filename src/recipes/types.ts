export type Recipe = { id:string; title:string; source:string; url:string; imageUrl:string; servings:number; calories:number; cuisine:string[]; dish:string[]; meal:string[]; diet:string[]; health:string[]; cautions:string[]; ingredientLines:string[]; nutrients:Record<string,{ label:string; quantity:number; unit:string }> };
export type RecipePage = { items: Recipe[]; page:number; pageSize:number; total:number };

