import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import ts from "typescript";
test("formulieren geven het huidige tabblad mee vóór de serveractie en dupliceren dat veld niet",()=>{
  class Form {
    inputs:{name:string;type:string;value:string}[]=[];
    querySelector(){return this.inputs.find(i=>i.name==="dossier_tab")??null;}
    appendChild(input:{name:string;type:string;value:string}){this.inputs.push(input);}
  }
  const compiled={exports:{} as {DossierTabContent:(props:{tab:string;children:null})=>{props:{onSubmitCapture:(event:{target:unknown})=>void}}}};
  const require=createRequire(import.meta.url);
  runInNewContext(ts.transpileModule(readFileSync("src/components/dossier-tab-content.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {module:compiled,exports:compiled.exports,require,HTMLFormElement:Form,document:{createElement:()=>({name:"",type:"",value:""})}});
  const form=new Form();
  compiled.exports.DossierTabContent({tab:"account",children:null}).props.onSubmitCapture({target:form});
  assert.deepEqual(form.inputs,[{name:"dossier_tab",type:"hidden",value:"account"}]);
  compiled.exports.DossierTabContent({tab:"dossiers",children:null}).props.onSubmitCapture({target:form});
  assert.equal(form.inputs.length,1);assert.equal(form.inputs[0].value,"dossiers");
  compiled.exports.DossierTabContent({tab:"account",children:null}).props.onSubmitCapture({target:{}});
});
