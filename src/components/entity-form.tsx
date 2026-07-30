import type { ReactNode } from "react";
import Link from "next/link";
import { FormModal } from "@/components/form-modal";
import { MarkdownField } from "@/components/markdown-field";

export function EntityForm({ title, action, children }: { title: string; action: (formData: FormData) => void | Promise<void>; children: ReactNode }) {
  return (
    <FormModal title={title}>
      <form action={action}>
        <label>Titel<input name="title"/></label>
        <MarkdownField name="description" label="Beschrijving" rows={4}/>
        {children}
        <div className="form-actions"><Link href="?">Annuleren</Link><button className="primary" type="submit">Opslaan</button></div>
      </form>
    </FormModal>
  );
}
