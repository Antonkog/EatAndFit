import assert from 'node:assert/strict';
import test from 'node:test';
import { recipeSearchParams } from '../src/recipes/filters';
test('recipe filters omit empty values and trim input', () => { assert.equal(recipeSearchParams({ query: ' tomato ', cuisine: '', meal: 'dinner' }).toString(), 'query=tomato&meal=dinner'); });
test('recipe filters preserve every scanned ingredient', () => { assert.equal(recipeSearchParams({ page: '1' }, [' tomato ', '', 'red onion']).toString(), 'page=1&ingredient=tomato&ingredient=red+onion'); });
