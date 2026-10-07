"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("BESC Command Center route error", error);
  }, [error]);

  return (
    <section className="app-error">
      <span className="eyebrow">ER GING IETS MIS</span>
      <h1>Deze pagina kon niet worden geladen.</h1>
      <p>Je gegevens zijn niet verloren. Probeer de pagina opnieuw te laden of keer terug naar het dashboard.</p>
      <div>
        <button onClick={reset}>Opnieuw proberen</button>
        <Link href="/app">Naar Home</Link>
      </div>
    </section>
  );
}
