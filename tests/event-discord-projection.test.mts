import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareEventDiscordProjection as prepare, validEventPresenceMeaning } from '../src/lib/event-discord-projection.ts';
const event={id:'00000000-0000-4000-8000-000000000001',title:'BESC community event',description:'PRIVATE: crew notes',status:'confirmed',start_at:'2030-06-01T18:00:00+02:00',end_at:'2030-06-01T21:00:00+02:00',deleted_at:null};
const release={event_id:event.id,guild_id:'1067893182387474432',enabled:true,public_title:'BESC community event',public_description:'Ontmoet de community.',public_location:'Gistel'};
const context={enabled:true,canManageEvents:true,guildId:release.guild_id,now:Date.parse('2030-01-01T00:00:00Z')};
test('Discord projection uses only the separately supplied public fields and real UTC instants',()=>{
 const r=prepare({...event,crew:['PRIVATE'],expected_attendees:500},release,context);assert.equal(r.kind,'ready');if(r.kind!=='ready')return;
 assert.equal(r.projection.description,release.public_description);assert.equal(r.projection.scheduled_start_time,'2030-06-01T16:00:00.000Z');assert.equal(r.projection.entity_type,3);assert.equal(r.projection.privacy_level,2);
 assert.ok(!JSON.stringify(r).includes('PRIVATE'));assert.ok(!JSON.stringify(r).includes('expected_attendees'));
});
test('Discord projection remains off, current manager permission is required, and explicit release is required',()=>{
 assert.equal(prepare(event,release,{...context,enabled:false}).kind,'disabled');assert.equal(prepare(event,release,{...context,canManageEvents:false}).kind,'unavailable');assert.equal(prepare(event,{...release,enabled:false},context).kind,'not_released');
});
test('CoastLAN in aftercare, past events, test fixtures, deletion and source/guild substitutions cannot publish',()=>{
 assert.equal(prepare({...event,status:'aftercare'},release,context).kind,'not_released');assert.equal(prepare({...event,title:'TESTFIXTURE event'},release,context).kind,'not_released');assert.equal(prepare({...event,deleted_at:'2030-01-01'},release,context).kind,'not_released');
 assert.equal(prepare(event,release,{...context,now:Date.parse('2031-01-01T00:00:00Z')}).kind,'not_upcoming');assert.equal(prepare(event,{...release,guild_id:'1067893182387474433'},context).kind,'unavailable');assert.equal(prepare(event,{...release,event_id:'00000000-0000-4000-8000-000000000002'},context).kind,'unavailable');
});
test('Discord projection requires explicit offset, ordered full times, bounded public text and no mass mentions',()=>{
 for(const e of [{...event,start_at:null},{...event,end_at:null},{...event,end_at:event.start_at},{...event,start_at:'2030-06-01T18:00:00'}])assert.notEqual(prepare(e,release,context).kind,'ready');
 for(const r of [{...release,public_title:'x'.repeat(101)},{...release,public_description:'@everyone hello'},{...release,public_description:'<@&123456789012345678>'},{...release,public_location:''},{...release,crew_notes:'private'}])assert.equal(prepare(event,r,context).kind,'invalid_public_fields');
});
test('Winter/summer offsets are normalized without inventing ambiguous wall times; changed public text changes the fingerprint',()=>{
 const a=prepare({...event,start_at:'2030-10-27T02:30:00+02:00',end_at:'2030-10-27T02:30:00+01:00'},release,context);assert.equal(a.kind,'ready');if(a.kind!=='ready')return;assert.equal(a.projection.scheduled_start_time,'2030-10-27T00:30:00.000Z');assert.equal(a.projection.scheduled_end_time,'2030-10-27T01:30:00.000Z');
 const b=prepare(event,release,context),c=prepare(event,{...release,public_description:'Andere publieke tekst.'},context);assert.ok(b.kind==='ready'&&c.kind==='ready'&&b.fingerprint!==c.fingerprint);
});
test('Discord interest, a personal RSVP and staff-recorded physical presence are distinct facts',()=>{
 assert.equal(validEventPresenceMeaning('interested','discord_interest'),true);assert.equal(validEventPresenceMeaning('coming','discord_interest'),false);assert.equal(validEventPresenceMeaning('attended','self_rsvp'),false);assert.equal(validEventPresenceMeaning('coming','self_rsvp'),true);assert.equal(validEventPresenceMeaning('withdrawn','self_rsvp'),true);assert.equal(validEventPresenceMeaning('attended','staff_check_in'),true);
});
