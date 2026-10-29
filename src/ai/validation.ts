export type AiRecipe = { title:string; description:string; servings:number; minutes:number; ingredients:string[]; steps:string[]; nutrition:{calories:number;protein:number;carbs:number;fat:number} };
export function validateAiFilters(value:{servings:number;idea:string}) { if(!Number.isInteger(value.servings)||value.servings<1||value.servings>20)return 'Servings must be between 1 and 20.'; if(value.idea.length>300)return 'Recipe idea is too long.'; return ''; }

