import assert from 'node:assert/strict';
import test from 'node:test';
import { canViewInternalPath } from '../src/lib/route-permissions.ts';

const id = 'b137f92d-cb18-4c8d-be9e-ac546abe5045';
const volunteer = { role: 'volunteer', finance_role: 'none' };

test('F3: volunteers reach campaign-specific authorization for pilot, report and export', () => {
  for (const suffix of ['', '/rapport', '/rapport/export']) {
    assert.equal(canViewInternalPath(`/app/campagnes/${id}/proef${suffix}`, volunteer), true, suffix);
  }
});

test('F3: pilot routing does not open campaign management or adjacent paths', () => {
  for (const path of [
    '/app/campagnes', `/app/campagnes/${id}`, `/app/campagnes/${id}/bewerken`,
    `/app/campagnes/${id}/proef/beheer`, `/app/campagnes/${id}/proef/rapport/other`,
    '/app/campagnes/geen-campagne-id/proef', `/app/campagnes/${id}/proef-extra`,
  ]) assert.equal(canViewInternalPath(path, volunteer), false, path);
});

test('F3: pilot routing still rejects unsupported organization roles', () => {
  for (const role of ['', 'guest', 'pending']) {
    assert.equal(canViewInternalPath(`/app/campagnes/${id}/proef`, { role, finance_role: 'none' }), false);
  }
});
