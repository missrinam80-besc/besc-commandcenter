import { setWorkspaceArchive } from "@/app/app/archief/workspace-actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

export function WorkspaceArchiveForm({ entity, id, version, archived }: {
  entity: "document" | "ticket";
  id: string;
  version: number;
  archived: boolean;
}) {
  const message = archived ? "Dit dossier terugzetten in het gewone overzicht?"
    : entity === "ticket"
      ? "Dit ticket naar het archief verplaatsen? Het wordt niet gesloten of uit Discord verwijderd. Een nieuw bericht van de aanvrager zet het terug."
      : "Deze documentregistratie naar het archief verplaatsen? Het document, bewijs en koppelingen blijven behouden.";
  return <form action={setWorkspaceArchive}>
    <input type="hidden" name="entity" value={entity} />
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="version" value={version} />
    <input type="hidden" name="archived" value={String(!archived)} />
    <ConfirmSubmitButton className="secondary" message={message}>
      {archived ? "Terugzetten" : "Naar archief"}
    </ConfirmSubmitButton>
  </form>;
}
