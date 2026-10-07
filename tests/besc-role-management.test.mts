import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { hasPermission, organizationRoleLabels } from "../src/lib/permissions.ts";
import { canViewInternalPath } from "../src/lib/route-permissions.ts";
import { accessMatrixForRole, accessMatrixForProfile } from "../src/lib/access-matrix.ts";
import { canReviewApproval } from "../src/lib/approvals.ts";

const migration = readFileSync("supabase/migrations/20261007152913_besc_role_management.sql", "utf8");
const org = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const uid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

test("technisch beheer is alleen voor Admin, ook met extra profielrechten", () => {
  assert.equal(organizationRoleLabels.member,"Crew");
  for (const role of ["board","member","volunteer"]) {
    const access={role,finance_role:"approver_treasurer",capabilities:["manageUsers","manageIntegrations","manageFinance"]};
    for(const capability of ["manageUsers","manageIntegrations"] as const) assert.equal(hasPermission(access,capability),false);
    for(const path of ["/app/beheer/rechten","/app/beheer/gebruikers","/app/beheer/import","/app/integraties","/app/integraties/logs","/app/integraties/social/twitch/start"]) assert.equal(canViewInternalPath(path,access),false,path);
  }
});

test("Bestuur heeft overzicht; functies zijn expliciet en combineerbaar",()=>{
  assert.equal(hasPermission({role:"board",finance_role:"none",capabilities:["manageFinance"]},"manageFinance"),false);
  for(const finance_role of ["none","approver","treasurer","approver_treasurer"]){
    const access={role:"board",finance_role};
    assert.equal(hasPermission(access,"manageFinance"),finance_role!=="none");
    assert.equal(canReviewApproval(access,"email"),["approver","approver_treasurer"].includes(finance_role));
    assert.equal(canReviewApproval(access,"expense"),finance_role!=="none");
    assert.equal(canViewInternalPath("/app/projecten",access),true);
    assert.equal(canViewInternalPath("/app/integraties",access),false);
  }
});

test("matrix volgt routes en onderscheidt beide externe rollen",()=>{
  for(const role of ["admin","board","member","volunteer"] as const){
    const rows=accessMatrixForRole(role);
    assert.equal(rows.find(r=>r.key==="integrations")?.view,role==="admin"?"yes":"no");
    assert.equal(rows.find(r=>r.key==="rights")?.view,role==="admin"?"yes":"no");
    if(role==="volunteer")assert.equal(rows.find(r=>r.key==="projects")?.view,"no");
  }
  for(const role of ["sponsor","streamteam"] as const){
    const rows=accessMatrixForRole(role);assert.equal(rows.length,1);assert.equal(rows[0].view,"limited");assert.equal(rows[0].edit,"no");assert.match(rows[0].dataScope,/Geen toegang tot \/app/);
  }
  const combined=accessMatrixForProfile({role:"board",finance_role:"approver_treasurer"});
  assert.equal(combined.find(r=>r.key==="content")?.approve,"yes");
});

test("echte RLS sluit technisch beheer af, behoudt eigen portaal en bewaakt functiecombinaties",async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,private to authenticated;
      create type public.member_role as enum ('admin','board','member','volunteer');
      create table organizations(id uuid primary key);
      create table profiles(id uuid primary key);
      create table organization_members(organization_id uuid,user_id uuid,role member_role,status text,finance_role text default 'none');
      alter table organization_members enable row level security;
      grant select,update on organization_members to authenticated;`);
    const core=readFileSync("supabase/migrations/20260712190000_initial_core.sql","utf8");
    await db.exec(core.slice(core.indexOf("create function private.is_active_member"),core.indexOf('create policy "own profile read"')));
    await db.exec(`create policy membership_read on organization_members for select to authenticated using(user_id=auth.uid() or private.is_org_manager(organization_id));
      create policy "manager membership update" on organization_members for update to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));`);
    await db.exec(readFileSync("supabase/migrations/20260812110000_add_custom_access_roles.sql","utf8"));
    for(const t of ["integration_connections","social_accounts","social_sync_runs","portal_access","approval_requests"]){
      await db.exec(`create table ${t}(id uuid default gen_random_uuid(),organization_id uuid,user_id uuid,created_by uuid,entity_type text,status text);
        alter table ${t} enable row level security;grant select,insert,update,delete on ${t} to authenticated;`);
      if(t!=="portal_access"&&t!=="approval_requests")await db.exec(`create policy legacy_manager on ${t} for all to authenticated using(private.is_org_manager(organization_id)) with check(private.is_org_manager(organization_id));`);
    }
    await db.exec(`create policy "users read own portal access" on portal_access for select to authenticated using(user_id=auth.uid());
      create policy "managers read portal access" on portal_access for select to authenticated using(private.is_org_manager(organization_id));
      create policy "managers update portal access" on portal_access for update to authenticated using(private.is_org_manager(organization_id));
      create policy approval_read on approval_requests for select to authenticated using(private.is_active_member(organization_id));
      create policy "authorized reviewers decide approval requests" on approval_requests for update to authenticated using(private.is_org_manager(organization_id));`);
    await db.query("insert into organizations values($1),($2)",[org,other]);
    const cases=[{n:1,role:"admin",finance:"none",status:"active"},{n:2,role:"board",finance:"none",status:"active"},{n:3,role:"member",finance:"none",status:"active"},{n:4,role:"volunteer",finance:"none",status:"active"},{n:5,role:"board",finance:"approver",status:"active"},{n:6,role:"board",finance:"treasurer",status:"active"},{n:7,role:"board",finance:"approver_treasurer",status:"active"},{n:8,role:"admin",finance:"none",status:"suspended"},{n:9,role:"member",finance:"approver",status:"active"}];
    for(const c of cases){await db.query("insert into profiles values($1)",[uid(c.n)]);await db.query("insert into organization_members(organization_id,user_id,role,status,finance_role)values($1,$2,$3,$4,$5)",[org,uid(c.n),c.role,c.status,c.finance]);}
    for(const t of ["integration_connections","social_accounts","social_sync_runs","portal_access","approval_requests"])await db.query(`insert into ${t}(organization_id,user_id,entity_type,status) values($1,$2,'email','pending')`,[org,uid(4)]);
    await db.exec(migration);await db.exec(migration);
    for(const c of cases){
      await db.exec("set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(c.n)]);
      const active=c.status==="active";const admin=c.role==="admin"&&active;
      for(const t of ["integration_connections","social_accounts","social_sync_runs"]){
        assert.equal((await db.query(`select * from ${t}`)).rows.length,admin?1:0,`${c.n} read ${t}`);
        assert.equal((await db.query(`update ${t} set status='changed' returning id`)).rows.length,admin?1:0);
        if(!admin)await assert.rejects(db.query(`insert into ${t}(organization_id)values($1)`,[org]));
      }
      assert.equal((await db.query("update organization_members set status=status where user_id=$1 returning user_id",[uid(3)])).rows.length,admin?1:0);
      assert.equal((await db.query<{allowed:boolean}>("select private.is_org_admin($1) as allowed",[other])).rows[0].allowed,false);
      assert.equal((await db.query<{allowed:boolean}>("select private.can_manage_finance($1) as allowed",[org])).rows[0].allowed,active&&hasPermission({role:c.role,finance_role:c.finance},"manageFinance"));
      assert.equal((await db.query<{allowed:boolean}>("select private.can_review_approval($1,'email') as allowed",[org])).rows[0].allowed,active&&canReviewApproval({role:c.role,finance_role:c.finance},"email"));
      const own=await db.query("select * from portal_access");assert.equal(own.rows.length,admin||c.n===4?1:0);
      assert.equal((await db.query("update portal_access set status='active' returning id")).rows.length,admin?1:0);
      await db.exec("reset role");
    }
    await db.exec("set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);
    await assert.rejects(db.query("update organization_members set finance_role='treasurer' where user_id=$1",[uid(3)]),/board_function_requires_board/);
    // Existing financial functions are preserved, and a board member can have both.
    assert.equal((await db.query("update organization_members set status=status where user_id=$1 returning user_id",[uid(9)])).rows.length,1);
    assert.equal((await db.query<{finance_role:string}>("update organization_members set finance_role='approver_treasurer' where user_id=$1 returning finance_role",[uid(2)])).rows[0].finance_role,"approver_treasurer");
    await db.exec("reset role;set role anon");await assert.rejects(db.query<{allowed:boolean}>("select private.is_org_admin($1)",[org]));
  }finally{await db.close();}
});
