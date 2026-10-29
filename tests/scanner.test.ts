import assert from 'node:assert/strict';import test from 'node:test';import {boundedDimensions} from '../src/scanner/image';
test('scanner dimensions preserve ratio without upscaling',()=>{assert.deepEqual(boundedDimensions(4000,2000),{width:1600,height:800});assert.deepEqual(boundedDimensions(800,600),{width:800,height:600})});
