import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
async function compile(path){const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'cjs',write:false});const compiled={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);return compiled.exports;}
const {validateStoreTime,validateStorePeriod,nextOpenDate,hoursForDate}=await compile('lib/store-hours.ts');
const {periodCharges,savedDiscount}=await compile('lib/weekend-pricing.ts');
const {t1Model}=await compile('lib/t1.ts');
test('weekday and Saturday opening boundaries are inclusive; Sunday and seconds after closing are rejected',()=>{
 for(const value of ['2030-10-18T09:00:00-03:00','2030-10-18T18:00:00-03:00','2030-10-19T08:00:00-03:00','2030-10-19T15:00:00-03:00'])assert.doesNotThrow(()=>validateStoreTime(value));
 for(const value of ['2030-10-18T08:59:59-03:00','2030-10-18T18:00:01-03:00','2030-10-19T07:59:59-03:00','2030-10-19T15:00:01-03:00','2030-10-20T12:00:00-03:00','2030-10-21T01:00:00Z','bad'])assert.throws(()=>validateStoreTime(value));
 assert.equal(nextOpenDate('2030-10-20'),'2030-10-21');assert.equal(hoursForDate('2030-02-30'),null);
 assert.throws(()=>validateStorePeriod('2030-10-18T09:00:00-03:00','2030-10-20T09:00:00-03:00'),/domingo/);
});
test('Sunday rental discount is limited to T1 Thursday/Friday through the following Monday, with full insurance',()=>{
 const quote=(start,end,model=t1Model)=>periodCharges(model,Date.parse(start+'T09:00:00-03:00'),Date.parse(end+'T09:00:00-03:00'));
 assert.equal(quote('2030-10-17','2030-10-21').total_cents,16500);
 const friday=quote('2030-10-18','2030-10-21');assert.equal(friday.total_cents,12000);assert.equal(friday.discount_cents,1500);assert.equal(friday.protection_cents,4500);assert.equal(friday.daily_cents,3000);
 for(const [start,end,model] of [['2030-10-19','2030-10-21'],['2030-10-17','2030-10-19'],['2030-10-18','2030-10-22'],['2030-10-18','2030-10-28'],['2030-10-18','2030-10-21',{...t1Model,id:'another'}]])assert.equal(quote(start,end,model).discount_cents,0);
 const saved={days:3,daily_cents:3000,terms_snapshot:JSON.stringify({promotion:friday.promotion})};assert.equal(savedDiscount(saved),1500);assert.equal(savedDiscount({...saved,terms_snapshot:'{}'}),0);
});
