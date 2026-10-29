import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AiRecipeBuilder } from '../ai/AiRecipeBuilder';
type Food = { fdcId:number; description:string; dataType:string };
type Details = Food & { nutrients:Array<{name:string;unit:string;amount:number}>; portions:Array<{amount:number;unit:string;grams:number}> };
export function NutritionLookup(){
  const [query,setQuery]=useState(''); const [foods,setFoods]=useState<Food[]>([]); const [selected,setSelected]=useState<Details>(); const [grams,setGrams]=useState(100);
  useEffect(()=>{if(query.trim().length<2){setFoods([]);return}const timer=setTimeout(()=>void fetch(`/api/nutrition/search?q=${encodeURIComponent(query)}`).then((r)=>r.ok?r.json():{items:[]}).then((data)=>setFoods(data.items)),250);return()=>clearTimeout(timer)},[query]);
  const open=(food:Food)=>void fetch(`/api/nutrition/foods/${food.fdcId}`).then((r)=>r.json()).then(setSelected);
  return <><AiRecipeBuilder/><section className="nutrition-lookup"><h3>USDA nutrition lookup</h3><label className="search-box"><Search size={18}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search foods"/></label>{foods.length>0&&<div className="food-results">{foods.map((food)=><button key={food.fdcId} onClick={()=>open(food)}>{food.description}<small>{food.dataType}</small></button>)}</div>}{selected&&<div className="nutrition-card"><h4>{selected.description}</h4><label>Amount <input type="number" min="0" value={grams} onChange={(e)=>setGrams(Number(e.target.value))}/> g</label><dl>{selected.nutrients.slice(0,12).map((item)=><div key={`${item.name}-${item.unit}`}><dt>{item.name}</dt><dd>{(item.amount*grams/100).toFixed(1)} {item.unit}</dd></div>)}</dl><p>Values are estimates from USDA FoodData Central.</p></div>}</section></>
}

