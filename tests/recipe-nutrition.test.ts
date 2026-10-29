import assert from 'node:assert/strict';
import test from 'node:test';
import { ingredientSearchQuery, nutritionPerServing, suggestIngredientGrams } from '../src/nutrition/recipeNutrition';

test('ingredient search removes quantity, size, and preparation text', () => {
  assert.equal(ingredientSearchQuery('2 medium potatoes, cut in wedges'), 'potatoes');
  assert.equal(ingredientSearchQuery('1 apple, thinly sliced'), 'apple');
  assert.equal(ingredientSearchQuery('½ cup chopped onion'), 'onion');
});

test('ingredient amounts use explicit weights and matching USDA portions', () => {
  assert.equal(suggestIngredientGrams('500 g potatoes'), 500);
  assert.equal(suggestIngredientGrams('2 medium potatoes', [{ amount: 1, grams: 173, description: '1 medium potato' }]), 346);
  assert.equal(suggestIngredientGrams('1 apple'), 100);
});

test('USDA recipe totals include all matched foods and are divided per serving', () => {
  const result = nutritionPerServing([
    { name: 'Energy', unit: 'kcal', amount: 900 },
    { name: 'Protein', unit: 'g', amount: 30 },
    { name: 'Carbohydrate, by difference', unit: 'g', amount: 120 },
    { name: 'Total lipid (fat)', unit: 'g', amount: 24 },
  ], 3);
  assert.deepEqual(result, { calories: 300, protein: 10, carbs: 40, fat: 8 });
});
