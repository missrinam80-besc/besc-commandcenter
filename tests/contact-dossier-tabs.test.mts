import assert from "node:assert/strict";
import test from "node:test";
import {appendContactTab,contactTabs,resolveContactTab} from "../src/lib/contact-dossier-tabs.ts";
test("contactfiches hebben zes vaste tabbladen en bewaren acties op een geldige lokale fiche",()=>{
  const id="10000000-0000-4000-8000-000000000001";
  for(const selectedModule of ["sponsors","community"]){
    assert.equal(contactTabs(selectedModule).length,6);
    assert.equal(resolveContactTab(selectedModule,{}),"algemeen");
    for(const tab of contactTabs(selectedModule)){
      const fd=new FormData();fd.set("dossier_tab",tab.id);
      assert.equal(resolveContactTab(selectedModule,{tab:tab.id,bewerken:"1"}),tab.id);
      assert.equal(appendContactTab(`/app/${selectedModule}/${id}?succes=bijgewerkt`,fd),`/app/${selectedModule}/${id}?succes=bijgewerkt&tab=${tab.id}`);
    }
  }
  assert.equal(resolveContactTab("sponsors",{succes:"contactmoment"}),"opvolging");
  assert.equal(resolveContactTab("community",{fout:"onboarding-opslaan"}),"intake");
  assert.equal(resolveContactTab("community",{koppeling:"relatie"}),"dossiers");
  assert.equal(resolveContactTab("community",{koppeling:"document"}),"documenten");
  const fd=new FormData();fd.set("dossier_tab","account");
  for(const href of [`https://evil.example/app/community/${id}`,`//evil.example/app/community/${id}`,`/app/events/${id}?succes=bijgewerkt`,`/app/sponsors/${id}?succes=bijgewerkt`])assert.equal(appendContactTab(href,fd),href);
  fd.set("dossier_tab","bogus&succes=fake");assert.equal(appendContactTab(`/app/community/${id}`,fd),`/app/community/${id}`);
});
