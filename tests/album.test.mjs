import test from 'node:test';
import assert from 'node:assert/strict';
import { movePhoto, saveAlbum, albumSession } from '../lib/images/saved-album.ts';
test('photo order is immutable and invalid destinations are ignored',()=>{
 const a=['one','two','three'];assert.deepEqual(movePhoto(a,2,0),['three','one','two']);assert.deepEqual(a,['one','two','three']);assert.equal(movePhoto(a,0,8),a);
});
test('existing photo operations are one RPC, preserve scope and surface failure',async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return {error:null};}};
 await saveAlbum(client,'home','style',['a','b'],[{key:'b',row:{id:'b'},turns:0}],2,albumSession(),()=>{});
 assert.deepEqual(calls[0],{name:'save_photo_album',args:{p_household:'home',p_style:'style',p_expected:['a','b'],p_photos:[{id:'b'}],p_shared_count:2}});
 await assert.rejects(()=>saveAlbum({rpc:async()=>({error:{message:'拒绝'}})},'home','style',[],[],1,albumSession(),()=>{}),/拒绝/);
});
