import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import ts from "typescript";
import { z } from "zod";
import { canManageExpenses, canSubmitExpense, allowedExpenseStatuses, expenseStatusOptions } from "../src/lib/expense-permissions.ts";

test("indieners kunnen geen goedkeuring, betaling of wijziging insturen", () => {
  for (const role of ["member", "volunteer"]) for (const finance_role of ["none", "submitter"]) {
    assert.equal(canManageExpenses({ role, finance_role }), false);
    for (const [status] of expenseStatusOptions) {
      assert.equal(canSubmitExpense({ status }, false), ["planned", "requested", "reimbursement_due"].includes(status));
    }
  }
  assert.equal(canSubmitExpense({ status: "requested", id: "existing" }, false), false);
  assert.equal(canSubmitExpense({ status: "requested", paid_at: "2026-10-07" }, false), false);
  assert.equal(canSubmitExpense({ status: "requested", payment_reference: "payment" }, false), false);
  assert.deepEqual(allowedExpenseStatuses(false).map(([s]) => s), ["planned", "requested", "reimbursement_due"]);
});

test("financiële beheerders behouden alle bestaande statusopties", () => {
  for (const membership of [{role:"admin",finance_role:"none"}, {role:"board",finance_role:"approver_treasurer"}, {role:"member",finance_role:"approver"}, {role:"volunteer",finance_role:"treasurer"}]) {
    assert.equal(canManageExpenses(membership), true);
    for (const [status] of expenseStatusOptions) assert.equal(canSubmitExpense({status,id:"existing"}, true), true);
  }
  assert.deepEqual(allowedExpenseStatuses(true), expenseStatusOptions);
});

test("saveExpense weigert vervalste formulierinzendingen voordat de database wordt aangeroepen", async () => {
  const calls: unknown[] = [];
  let membership = {role:"member",finance_role:"none",organization_id:"10000000-0000-4000-8000-000000000001"};
  const exports: { saveExpense?: (fd: FormData) => Promise<void> } = {};
  const code = ts.transpileModule(readFileSync("src/app/app/financien/actions.ts","utf8"), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const dependencies: Record<string,unknown> = {
    "zod": {z},
    "@/lib/permissions": {},
    "next/cache": {revalidatePath:()=>{}},
    "next/navigation": {redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`);}},
    "@/lib/expense-permissions": {canManageExpenses,canSubmitExpense},
    "@/lib/auth-context": {requireActiveMembership:async()=>({membership,user:{id:"20000000-0000-4000-8000-000000000001"},supabase:{from:()=>({
      insert:(values:unknown)=>{calls.push(values);return{select:()=>({single:async()=>({data:{id:"new"},error:null})})};},
      update:()=>{throw new Error("Unexpected update");},
    })}})},
  };
  new Function("require","exports",code)((name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];},exports);
  const form = (status:string, extras:Record<string,string>={}) => {
    const fd = new FormData();
    for (const [key,value] of Object.entries({title:"TESTFIXTURE",category:"other",amount:"0",status,...extras})) fd.set(key,value);
    return fd;
  };
  for (const fd of [form("approved"),form("paid"),form("reimbursed"),form("requested",{paid_at:"2026-10-07"}),form("requested",{payment_reference:"payment"}),form("requested",{id:"30000000-0000-4000-8000-000000000001"})]) {
    await assert.rejects(exports.saveExpense!(fd), /REDIRECT:.*fout=geen-toegang/);
    assert.equal(calls.length,0);
  }
  await assert.rejects(exports.saveExpense!(form("requested")), /REDIRECT:.*kosten\/new/);
  assert.equal(calls.length,1);
  membership = {...membership,finance_role:"approver"};
  await assert.rejects(exports.saveExpense!(form("approved")), /REDIRECT:.*kosten\/new/);
  assert.equal(calls.length,2);
});

test("echte Postgres-RLS blokkeert bevoorrechte inserts en vervalste goedkeuringsgegevens", async () => {
  const db = new PGlite();
  const uid = "20000000-0000-4000-8000-000000000001";
  const org = "10000000-0000-4000-8000-000000000001";
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,private to authenticated;
      create table organization_members(organization_id uuid,user_id uuid,role text,status text,finance_role text);
      create function private.is_active_member(org_id uuid) returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from public.organization_members where organization_id=org_id and user_id=auth.uid() and status='active')$$;
      create table expenses(id uuid default gen_random_uuid(),organization_id uuid,created_by uuid,submitted_by uuid,status text,
        approved_by uuid,approved_at timestamptz,paid_at date,payment_reference text);
      alter table expenses enable row level security;
      grant select,insert,update on expenses to authenticated;`);
    const prior = readFileSync("supabase/migrations/20260723190000_harden_finance_workflows.sql", "utf8");
    await db.exec(prior.slice(prior.indexOf("create or replace function private.can_manage_finance"), prior.indexOf("create table public.financial_audit_log")));
    const original = readFileSync("supabase/migrations/20260723170000_add_finance_module.sql", "utf8");
    await db.exec(original.split("\n").find(line => line.startsWith('create policy "members create expenses"'))!);
    await db.exec(`create policy read_expenses on expenses for select to authenticated using(private.is_active_member(organization_id));
      create policy update_expenses on expenses for update to authenticated using(private.can_manage_finance(organization_id)) with check(private.can_manage_finance(organization_id));`);
    const migration = readFileSync("supabase/migrations/20261007081552_restrict_expense_submission_status.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    await db.query("insert into organization_members values($1,$2,'member','active','none')", [org, uid]);
    const insert = async (status: string, field?: string, value?: string) => {
      await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
      try {
        await db.query(`insert into expenses(organization_id,created_by,submitted_by,status${field ? ','+field : ''}) values($1,$2,$2,$3${field ? ',$4' : ''})`, [org,uid,status,...(field?[value]:[])]);
      } finally { await db.exec("reset role"); }
    };
    for (const role of ["member", "volunteer"]) {
      await db.query("update organization_members set role=$1", [role]);
      for (const [status] of expenseStatusOptions) {
        if (["planned","requested","reimbursement_due"].includes(status)) await insert(status);
        else await assert.rejects(insert(status), /row-level security/);
      }
    }
    for (const [field,value] of [["approved_by",uid],["approved_at","2026-10-07"],["paid_at","2026-10-07"],["payment_reference","paid"]]) {
      await assert.rejects(insert("requested",field,value), /row-level security/);
    }
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
    assert.equal((await db.query("update expenses set status='approved' returning id")).rows.length, 0);
    await assert.rejects(db.query("insert into expenses(organization_id,created_by,submitted_by,status) values($1,$2,null,'requested')",[org,uid]), /row-level security/);
    await assert.rejects(db.query("insert into expenses(organization_id,created_by,submitted_by,status) values($1,$2,'20000000-0000-4000-8000-000000000002','requested')",[org,uid]), /row-level security/);
    await assert.rejects(db.query("insert into expenses(organization_id,created_by,submitted_by,status) values('10000000-0000-4000-8000-000000000002',$1,$1,'requested')",[uid]), /row-level security/);
    await db.exec("reset role");
    for (const [role,finance] of [["admin","none"],["board","none"],["member","approver"],["volunteer","treasurer"]]) {
      await db.query("update organization_members set role=$1,finance_role=$2",[role,finance]);
      for (const [status] of expenseStatusOptions) await insert(status);
    }
    await db.query("update organization_members set status='pending'");
    await assert.rejects(insert("approved"), /row-level security/);
    await assert.rejects(insert("requested"), /row-level security/);
  } finally { await db.close(); }
});
