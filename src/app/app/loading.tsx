export default function AppLoading() {
  return (
    <section className="app-loading" aria-live="polite" aria-busy="true">
      <div className="loading-mark">B</div>
      <div>
        <strong>Pagina laden</strong>
        <span>We halen de inhoud op…</span>
      </div>
    </section>
  );
}
