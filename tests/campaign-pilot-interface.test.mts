import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import * as pilot from '../src/lib/campaign-pilot.ts';
import { pilotSelectionFromQuery } from '../src/lib/campaign-pilot-selection.ts';
import type { PilotState } from '../src/lib/campaign-pilot.ts';
const native = createRequire(import.meta.url);
function load(file: string, mocks: Record<string, unknown>) {
  const compiled = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { module: compiled, exports: compiled.exports, FormData, URLSearchParams, process: { env: { BESC_CAMPAIGNS_PILOT_ENABLED: 'true' } }, require: (key: string) => key.endsWith('.css') ? {} : key in mocks ? mocks[key] : native(key) });
  return compiled.exports;
}
const empty: PilotState = { synthetic: true, campaign_id: 'fixture', chair: false, editor: false, reviewer: false, reader: false, policies: [], participants: [], posts: [], measurements: [], access: [] };
const link = ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement('a', { href }, children);
const panels = load('src/components/campaign-pilot-panel.tsx', { 'next/link': { default: link }, '@/app/app/campagnes/[id]/proef/actions': { runCampaignPilot: async () => {} } });
const Panel = panels.CampaignPilotPanel as React.ComponentType<{ state: PilotState; org: string; campaign: string; people: unknown[]; members: unknown[]; documents: unknown[] }>;
function markup(state: PilotState) { return renderToStaticMarkup(React.createElement(Panel, { state, org: 'org', campaign: 'campaign', people: [], members: [], documents: [] })); }
test('F3 UI: reader has no mutation forms', () => { const html = markup({ ...empty, reader: true }); assert(!html.includes('access.assign')); assert(!html.includes('policy.set')); assert(!html.includes('measurement.record')); assert(html.includes('Intern testrapport')); });
test('F3 UI: chair gets explicit access/policy actions, no automatic measurement editor', () => { const html = markup({ ...empty, chair: true }); assert(html.includes('access.assign')); assert(html.includes('policy.set')); assert(!html.includes('measurement.record')); });
test('F3 UI: own participant sees exact text and own confirmation, never another person selector', () => {
  const state = { ...empty, policies: [{ id: 'p', version: 1, body: 'TESTFIXTURE <script>secret</script>', fields: ['post_url'], retention: 'Alleen testbewijs', withdrawn_at: null }], participants: [{ id: 'a', person_id: 'person', policy_id: 'p', accepted_at: null, expires_at: '2030-01-01T00:00:00Z', withdrawn_at: null, valid: false, own: true }] };
  const html = markup(state); assert(html.includes('participant.accept')); assert(!html.includes('participant.select')); assert(!html.includes('<script>secret')); assert(html.includes('&lt;script&gt;')); assert(html.includes('Alleen testbewijs'));
});
test('F3 UI: every mutating form carries campaign/org/request; visible fields have labels', () => {
  const dom = new JSDOM(markup({ ...empty, chair: true, editor: true }));
  const forms = [...dom.window.document.querySelectorAll('form')]; assert(forms.length >= 4);
  for (const form of forms) {
    for (const key of ['campaign_id', 'organization_id', 'request_id', 'operation']) assert(form.querySelector(`input[name="${key}"]`));
    for (const field of form.querySelectorAll('input:not([type=hidden]),select,textarea')) assert(field.closest('label'));
  }
});
test('F3 UI: date windows use Brussels conversion, finite freshness and no overlap', () => {
  const q = { metric: 'views', definition: 'TESTFIXTURE', semantics: 'period', first_start: '2026-10-25T01:30', first_end: '2026-10-25T03:30', second_start: '2026-10-26T01:30', second_end: '2026-10-26T03:30', freshness: '168' };
  const s = pilotSelectionFromQuery(q, '2026-10-27T00:00:00Z'); assert(s); assert.equal(Date.parse(s.first.end) - Date.parse(s.first.start), 10800000);
  assert.equal(pilotSelectionFromQuery({ ...q, freshness: '' }, '2026-10-27T00:00:00Z'), null);
});
test('F3 action: URL is parsed without fetch and invalid operator cannot reach RPC', async () => {
  const calls: unknown[] = [];
  const compiled = load('src/app/app/campagnes/[id]/proef/actions.ts', { 'next/navigation': { redirect: (target: string) => { throw Error('REDIRECT:' + target); } }, 'next/cache': { revalidatePath: () => {} }, '@/lib/campaign-pilot': pilot, '@/lib/format': { localDateTimeToIso: (x: string) => x }, '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'actor' } } }) }, rpc: async (...args: unknown[]) => { calls.push(args); return { data: {}, error: null }; } }) } });
  const action = compiled.runCampaignPilot as (data: FormData) => Promise<void>;
  const data = new FormData(); const id = '11111111-1111-4111-8111-111111111111'; for (const [k, v] of Object.entries({ campaign_id: id, organization_id: id, request_id: id, operation: 'post.submit', data_participant_id: id, post_url: 'https://127.0.0.1/secret' })) data.set(k, v);
  await assert.rejects(action(data), /fout=link/); assert.equal(calls.length, 0);
  data.set('post_url', 'https://youtu.be/abcdefghijk'); await assert.rejects(action(data), /succes=opgeslagen/); assert.equal(calls.length, 1); assert.equal(JSON.stringify(calls).includes('external_id'), true);
});
