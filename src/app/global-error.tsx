"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="nl">
      <body>
        <main className="app-error">
          <span className="eyebrow">ER GING IETS MIS</span>
          <h1>Het Command Center kon niet worden geladen.</h1>
          <p>Probeer de pagina opnieuw te laden. Als dit blijft gebeuren, keer dan terug naar het inlogscherm.</p>
          <div>
            <button onClick={reset}>Opnieuw proberen</button>
            <a href="/login">Naar inloggen</a>
          </div>
        </main>
      </body>
    </html>
  );
}
