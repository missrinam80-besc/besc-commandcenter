import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
const org="10000000-0000-4000-8000-000000000001",other="10000000-0000-4000-8000-000000000002",user="20000000-0000-4000-8000-000000000001",admin="20000000-0000-4000-8000-000000000002",foreign="20000000-0000-4000-8000-000000000003",id="30000000-0000-4000-8000-000000000001";
const payload={title:"TESTFIXTURE kost",amount:15.25,expense_date:"2026-10-14",supplier:"TESTFIXTURE",invoice_number:"BON-1",claimant_name:"TESTFIXTURE indiener",notes:"TESTFIXTURE toelichting",event_id:"",proof:null};
test("intake bewaakt eigenaar, organisatie, privébewijs, atomaire omzetting en idempotency",async()=>{
 const db=new PGlite();try{
 await db.exec(readFileSync("tests/helpers/expense-intake-fixture.sql","utf8"));
 await db.exec(readFileSync("supabase/migrations/20261014120609_expense_inbox_intake.sql","utf8"));
 const actor=async(a:string)=>db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='${a}'`);
 const prepare=(body:unknown=payload,oid=org)=>db.query('select prepare_expense_intake($1,$2,$3::jsonb)',[oid,id,JSON.stringify(body)]);
 const finish=()=>db.query('select finish_expense_intake($1,$2)',[org,id]);const convert=()=>db.query<{id:string}>('select convert_expense_intake($1,$2) id',[org,id]);
 await actor(user);await assert.rejects(prepare(payload,other));await assert.rejects(prepare({...payload,amount:-1}));await assert.rejects(prepare({...payload,amount:1.001}));await assert.rejects(prepare({...payload,status:"paid"}));
 const proof={path:`${org}/${user}/${id}/proof.png`,label:"TESTFIXTURE bewijs.png",mime:"image/png",size:16,sha256:"a".repeat(64)},body={...payload,proof};
 await assert.rejects(prepare({...body,proof:{...proof,path:`${other}/${user}/${id}/proof.png`}}));
 await prepare(body);await prepare(body);await assert.rejects(prepare({...body,title:"Changed"}));
 assert.equal((await db.query('select * from inbox_items')).rows.length,0);
 await assert.rejects(finish());
 await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',["expense-proofs",proof.path,JSON.stringify({size:16,mimetype:"image/png"})]);
 await finish();await finish();assert.equal((await db.query('select * from expense_intakes')).rows.length,1);
 assert.equal((await db.query(`delete from storage.objects where name='${proof.path}' returning id`)).rows.length,0);
 assert.equal((await db.query(`update storage.objects set metadata='{}' where name='${proof.path}' returning id`)).rows.length,0);
 await assert.rejects(db.query('update expense_intakes set expense_id=gen_random_uuid()'));
 await assert.rejects(convert());
 await actor(foreign);assert.equal((await db.query('select * from expense_intakes')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(convert());
 await actor(admin);assert.equal((await db.query('select * from inbox_items')).rows.length,1);
 // A failing expenses trigger cannot mark the inbox item processed.
 await db.exec(`reset role;create function public.fixture_fail() returns trigger language plpgsql as $$begin raise exception 'TESTFIXTURE';end$$;create trigger fixture_fail before insert on expenses for each row execute function fixture_fail();set role authenticated;`);
 await assert.rejects(convert());assert.equal((await db.query<{status:string}>('select status from inbox_items')).rows[0].status,"new");
 await db.exec('reset role;drop trigger fixture_fail on expenses;set role authenticated;');
 const result=await convert();assert.equal((await convert()).rows[0].id,result.rows[0].id);
 await db.exec('reset role');const expenses=await db.query<{submitted_by:string;amount:string;status:string}>('select * from expenses');assert.equal(expenses.rows.length,1);assert.equal(expenses.rows[0].submitted_by,user);assert.equal(Number(expenses.rows[0].amount),15.25);assert.equal(expenses.rows[0].status,"requested");
 assert.equal((await db.query<{status:string}>('select status from inbox_items')).rows[0].status,"processed");
 await actor(admin);await assert.rejects(db.exec(`update expenses set expense_intake_id=null where id='${result.rows[0].id}'`));
 await db.exec(`reset role;`);await assert.rejects(db.exec(`update inbox_items set source='manual' where id='${id}'`));await actor(admin);await db.exec(`update expenses set status='paid' where id='${result.rows[0].id}'`);
 await db.exec(`reset role;update organization_members set status='inactive' where user_id='${user}';`);await actor(user);assert.equal((await db.query('select * from expense_intakes')).rows.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 await db.exec('reset role');
 assert.equal((await db.query<{safe:boolean}>(`select bool_and(not p.prosecdef and not has_function_privilege('anon',p.oid,'EXECUTE')) safe from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('prepare_expense_intake','finish_expense_intake','convert_expense_intake')`)).rows[0].safe,true);
 assert.equal((await db.query<{public:boolean}>(`select public from storage.buckets where id='expense-proofs'`)).rows[0].public,false);
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from expense_intakes'));await assert.rejects(prepare());
 }finally{await db.close();}
});
