import assert from 'node:assert/strict'; import test from 'node:test'; import { scaleNutrients } from '../src/nutrition/math';
test('nutrients scale from their 100 gram basis',()=>{assert.deepEqual(scaleNutrients([{name:'Protein',unit:'g',amountPer100g:20}],50)[0].amount,10)});

