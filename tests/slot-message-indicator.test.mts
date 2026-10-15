import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {editorLoader} from "./helpers/editor-loader.mts";
const Indicator=editorLoader({})("src/components/slot-message-indicator.tsx").SlotMessageIndicator as React.ComponentType<{kind:string;state:string}>;
test("berichticonen tonen verzonden groen, actieve verwerking geel en fouten of onzekerheid rood met toegankelijke uitleg",()=>{
 for(const [state,tone,label] of [["sent","success","verzonden"],["queued","waiting","ingepland"],["leased","waiting","in verwerking"],["dispatching","waiting","wordt verzonden"],["failed","error","mislukt"],["uncertain","error","verzending onzeker"],["unknown","error","onbekende status"]]){
 const html=renderToStaticMarkup(React.createElement(Indicator,{kind:"verify",state}));assert.ok(html.includes(`slot-tone-${tone}`));assert.ok(html.includes(`aria-label="Verificatie: ${label}`));assert.match(html,/tabindex="0"/);
 }
});
