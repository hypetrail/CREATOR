import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),result=await build({entryPoints:['lib/fleet-fit.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const compiled={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);
const {supportsLoad}=compiled.exports;
test('T1 strictly excludes the 120 kg combined-load boundary',()=>{
 const t1={capacity:120,capacity_exclusive:true};
 assert.equal(supportsLoad(t1,119.9),true);assert.equal(supportsLoad(t1,120),false);assert.equal(supportsLoad(t1,120.1),false);
});
test('models with an inclusive limit continue accepting their exact supported load',()=>{
 assert.equal(supportsLoad({capacity:150},150),true);assert.equal(supportsLoad({capacity:150},150.1),false);
});
test('unknown limits or invalid and negative combined loads are not recommended',()=>{
 for(const weight of [0,-1,NaN,Infinity])assert.equal(supportsLoad({capacity:120,capacity_exclusive:true},weight),false);
 assert.equal(supportsLoad({},80),false);assert.equal(supportsLoad({capacity:null},80),false);
});
