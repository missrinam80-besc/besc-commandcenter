import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const native=createRequire(import.meta.url);
export function loadCreatorModule(filename,overrides={}){
 const compiled={exports:{}};
 const source=readFileSync(new URL('../../src/lib/'+filename,import.meta.url),'utf8');
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:compiled,exports:compiled.exports,Buffer,URL,process,require:name=>name==='server-only'?{}:overrides[name]??native(name)});
 return compiled.exports;
}
