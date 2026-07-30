import { X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function FormModal({
  title,
  children,
  closeHref = "?",
  description,
}: {
  title: string;
  children: ReactNode;
  closeHref?: string;
  description?: string;
}) {
  return (
    <div className="form-modal-backdrop" role="presentation">
      <section
        aria-labelledby="form-modal-title"
        aria-modal="true"
        className="form-card form-modal"
        role="dialog"
      >
        <div className="form-heading">
          <div>
            <h2 id="form-modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <Link aria-label="Sluiten" className="form-modal-close" href={closeHref}>
            <X size={18}/>
          </Link>
        </div>
        <div className="form-modal-content">{children}</div>
      </section>
    </div>
  );
}
