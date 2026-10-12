import {existsSync,readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {dirname,resolve} from "node:path";
import {runInNewContext} from "node:vm";
import ts from "typescript";

// Loads real editor modules with only external services replaced by fixtures.
export function editorLoader(overrides:Record<string,unknown>={}){
 const native=createRequire(import.meta.url),cache=new Map<string,Record<string,unknown>>();
 function load(file:string):Record<string,unknown>{
  file=resolve(file);const existing=cache.get(file);if(existing)return existing;
  const compiled={exports:{} as Record<string,unknown>};cache.set(file,compiled.exports);
  const require=(name:string):unknown=>{
   if(name in overrides)return overrides[name];
   if(name.endsWith(".json"))return native(resolve(dirname(file),name));
   if(name.startsWith("@/lib/"))return load(`src/lib/${name.slice(6)}.ts`);
   if(name.startsWith("./")||name.startsWith("../")){const base=resolve(dirname(file),name);return load(existsSync(base)?base:existsSync(`${base}.ts`)?`${base}.ts`:`${base}.tsx`);}
   return native(name);
  };
  runInNewContext(ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:compiled,exports:compiled.exports,require,URL});
  return compiled.exports;
 }
 return load;
}
