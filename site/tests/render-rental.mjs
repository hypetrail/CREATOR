import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const result=await build({entryPoints:['app/rental-app.tsx'],bundle:true,platform:'node',format:'cjs',write:false,external:['react','react-dom'],jsx:'automatic'});
const m={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(m,m.exports,require);
const React=require('react'),{renderToString}=require('react-dom/server');
writeFileSync('/tmp/calorimob-rental-ssr.html',renderToString(React.createElement(m.exports.default)));
console.log('Initial React rental page renders without runtime errors.');
