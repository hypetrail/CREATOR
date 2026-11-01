import test from 'node:test';
import assert from 'node:assert/strict';
import {models,filterModels,recommend} from '../lib/catalog.js';
test('combined filters respect unknown data and all selected resources',()=>{
 const results=filterModels(models,{power:'1000',range:60,features:['removable','bluetooth']});
 assert.deepEqual(results.map(m=>m.id),['kmw']);
 assert.ok(!filterModels(models,{range:60}).some(m=>m.id==='e60'));
 assert.ok(filterModels(models,{power:'unknown'}).every(m=>m.power===null));
 assert.equal(filterModels(models,{query:'  bolin  '}).length,2);
 assert.equal(filterModels(models,{features:['nfc','hydraulic']}).length,0);
});
test('advisor excludes unsuitable distance and load instead of forcing a match',()=>{
 assert.equal(recommend(models,{distance:60,weight:80}).candidates.length,0);
 assert.equal(recommend(models,{distance:20,weight:250}).candidates.length,0);
 const highLoad=recommend(models,{distance:20,weight:190});
 assert.deepEqual(highLoad.candidates.map(c=>c.model.id),['cx18']);
 const route=recommend(models,{distance:35,weight:190});
 assert.equal(route.need,44);
 assert.equal(route.candidates.length,0);
});
test('required resources constrain advisor and missing specs remain excluded',()=>{
 const reverse=recommend(models,{distance:20,weight:80,required:['reverse']});
 assert.deepEqual(reverse.candidates.map(c=>c.model.id),['cx18']);
 const hydraulic=recommend(models,{distance:20,weight:80,required:['hydraulic']});
 assert.deepEqual(hydraulic.candidates.map(c=>c.model.id),['kmw']);
 const normal=recommend(models,{distance:20,weight:80});
 assert.ok(normal.excluded.includes('E60'));
 assert.ok(normal.excluded.includes('X13 Panda'));
 assert.ok(normal.candidates.every(c=>c.model.capacity>=80&&c.model.range!==null));
});
test('source integrity: unique IDs, resource definitions, historical prices and divergences',()=>{
 assert.equal(new Set(models.map(m=>m.id)).size,models.length);
 assert.equal(models.find(m=>m.id==='e60').range,null);
 assert.match(models.find(m=>m.id==='e60').priceNote,/26\/09\/2026/);
 assert.match(models.find(m=>m.id==='cx18').brakes,/divergentes/);
 assert.equal(models.find(m=>m.id==='cx18').features.includes('hydraulic'),false);
 assert.ok(models.every(m=>m.source));
});
