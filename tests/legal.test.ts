import assert from 'node:assert/strict';import test from 'node:test';import {legalSources} from '../src/settings/legal';
test('settings identify all external data sources and licenses',()=>{assert.equal(legalSources.length,4);assert.match(legalSources.find((item)=>item.title==='Recipe catalog')!.license,/NC/);assert.match(legalSources.find((item)=>item.title==='Nutrition data')!.license,/CC0/)});
