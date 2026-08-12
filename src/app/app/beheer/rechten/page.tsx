import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/auth-context";
import {
  accessMatrixForRole,
  accessRoleLabels,
  accessSummaryForRole,
  type AccessDecision,
  type AccessRoleKey,
} from "@/lib/access-matrix";

const roles: AccessRoleKey[] = [
  "admin",
  "board",
  "volunteer",
  "member",
  "portal",
  "expense_submitter",
  "approver",
  "treasurer",
];

const decisionLabels: Record<AccessDecision, string> = {
  yes: "Ja",
  own: "Eigen",
  limited: "Beperkt",
  no: "Nee",
};

function decisionClass(decision: AccessDecision) {
  return `permission-decision ${decision}`;
}

function Decision({ value }: { value: AccessDecision }) {
  return <span className={decisionClass(value)}>{decisionLabels[value]}</span>;
}

export default async function AccessControlPage({
  searchParams,
}: {
  searchParams: Promise<{ rol?: string }>;
}) {
  await requirePermission("manageOrganization", "/app?fout=geen-toegang");
  const query = await searchParams;
  const activeRole = roles.includes(query.rol as AccessRoleKey)
    ? query.rol as AccessRoleKey
    : "admin";
  const rows = accessMatrixForRole(activeRole);
  const summaries = roles.map(accessSummaryForRole);

  return (
    <AppShell active="Rechtencontrole">
      <header className="topbar module-top">
        <div>
          <p>ADMIN & RECHTEN</p>
          <h1>Rechtencontrole</h1>
        </div>
      </header>
      <div className="module-body permissions-audit-page">
        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">V1-controle</span>
              <h2>Rollenmatrix</h2>
            </div>
            <span>8 rollen</span>
          </div>
          <p className="lead">
            Dit overzicht controleert wie mag aanmaken, bewerken, archiveren,
            verwijderen, exporteren, goedkeuren en welke data zichtbaar is.
            Portalgebruikers blijven buiten de interne app en zien alleen hun eigen portaal.
          </p>
          <div className="permission-role-tabs">
            {summaries.map((summary) => (
              <a
                className={summary.role === activeRole ? "active" : ""}
                href={`/app/beheer/rechten?rol=${summary.role}`}
                key={summary.role}
              >
                <ShieldCheck size={15}/>
                <strong>{summary.label}</strong>
                <span>{summary.canView} zichtbaar · {summary.canApprove} goedkeuringen</span>
              </a>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Actieve rol</span>
              <h2>{accessRoleLabels[activeRole]}</h2>
            </div>
            <span>{rows.length} onderdelen</span>
          </div>
          <div className="permissions-table">
            <div className="permissions-head">
              <span>Onderdeel</span>
              <span>Zien</span>
              <span>Aanmaken</span>
              <span>Bewerken</span>
              <span>Archiveren</span>
              <span>Verwijderen</span>
              <span>Exporteren</span>
              <span>Goedkeuren</span>
              <span>Data</span>
            </div>
            {rows.map((row) => (
              <article key={row.key}>
                <strong>{row.label}</strong>
                <Decision value={row.view}/>
                <Decision value={row.create}/>
                <Decision value={row.edit}/>
                <Decision value={row.archive}/>
                <Decision value={row.delete}/>
                <Decision value={row.export}/>
                <Decision value={row.approve}/>
                <p>{row.dataScope}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
