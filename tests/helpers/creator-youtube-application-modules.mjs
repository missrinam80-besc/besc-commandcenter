import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const native=createRequire(import.meta.url);
export function creatorApplicationModules(overrides={}){
 const loaded=new Map();
 function load(name){
  name=name.replace(/\.ts$/,'');if(loaded.has(name))return loaded.get(name);
  const compiled={exports:{}};loaded.set(name,compiled.exports);
  const source=readFileSync(new URL('../../src/lib/'+name+'.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  runInNewContext(code,{module:compiled,exports:compiled.exports,Buffer,URL,URLSearchParams,Headers,Request,Response,AbortController,TextDecoder,setTimeout,clearTimeout,process,fetch:overrides.__fetch??globalThis.fetch,require:key=>key==='server-only'?{}:key in overrides?overrides[key]:key.startsWith('./creator-youtube-')?load(key.slice(2)):native(key)});
  loaded.set(name,compiled.exports);return compiled.exports;
 }
 return load;
}
