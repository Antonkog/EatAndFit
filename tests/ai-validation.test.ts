import assert from 'node:assert/strict'; import test from 'node:test'; import { validateAiFilters } from '../src/ai/validation';
test('AI filters enforce bounded servings and ideas',()=>{assert.equal(validateAiFilters({servings:2,idea:'salad'}),'');assert.match(validateAiFilters({servings:0,idea:''}),/Servings/);assert.match(validateAiFilters({servings:2,idea:'x'.repeat(301)}),/long/)});
