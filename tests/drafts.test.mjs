import test from 'node:test';
import assert from 'node:assert/strict';
import { draftKey } from '../lib/collection/drafts.ts';
test('local draft keys isolate accounts, households, new forms and edited instances',()=>{
  const keys=[draftKey('u1','h1'),draftKey('u2','h1'),draftKey('u1','h2'),draftKey('u1','h1','i1'),draftKey('u1','h1','i2')];
  assert.equal(new Set(keys).size,5);
  assert.notEqual(draftKey('a:b','c'),draftKey('a','b:c'));
});
