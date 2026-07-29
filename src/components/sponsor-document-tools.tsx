import { ExternalLink, FilePlus2 } from "lucide-react";
import { generateSponsorReport } from "@/app/app/google-document-actions";
import { requireActiveMembership } from "@/lib/auth-context";

export async function SponsorDocumentTools({ partnerId }: { partnerId: string }) {
  const { supabase, membership } = await requireActiveMembership();
  const { data: document } = await supabase
    .from("google_resource_links")
    .select("name,web_url")
    .eq("organization_id", membership.organization_id)
    .eq("entity_type", "partner")
    .eq("entity_id", partnerId)
    .eq("resource_type", "document")
    .maybeSingle();

  return (
    <section className="detail-section sponsor-document-dock">
      <div className="section-heading">
        <div>
          <span className="eyebrow">GOOGLE WORKSPACE</span>
          <h2>Sponsorrapport</h2>
        </div>
      </div>
      {document ? (
        <article className="subtle-card">
          <div>
            <strong>{document.name}</strong>
            <p>Het rapport blijft in Google Drive; het Command Center bewaart alleen de link en metadata.</p>
          </div>
          <a href={document.web_url} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            Open rapport
          </a>
        </article>
      ) : (
        <div className="empty-state compact">
          <p>Maak een sponsorrapport op basis van het ingestelde Google Docs-template.</p>
          <form action={generateSponsorReport}>
            <input type="hidden" name="partner_id" value={partnerId} />
            <button className="primary" type="submit">
              <FilePlus2 size={16} />
              Genereer sponsorrapport
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
