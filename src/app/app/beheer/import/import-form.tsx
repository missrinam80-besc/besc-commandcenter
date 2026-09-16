"use client";
import { useState } from "react";
const sets = ["projects", "events", "campaigns", "sponsors", "streamers", "materials", "knowledge"];
export default function ImportForm() {
  const [result, setResult] = useState(""); const [busy, setBusy] = useState(false);
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const dataset = f.name.replace(/-(bestaand|uitgebreid)\.csv$/i, "");
    if (!sets.includes(dataset)) { setResult("Gebruik een bestaand CSV-bestand met een ondersteund type."); return; }
    setBusy(true);
    const res = await fetch("/api/import/csv", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataset, csv: await f.text() }) });
    const d = await res.json(); setResult(res.ok ? `${d.imported} geïmporteerd, ${d.skipped} overgeslagen, ${d.errors?.length ?? 0} fouten.` : d.error); setBusy(false);
  }
  return <section className="panel"><div className="panel-head"><div><span className="eyebrow">BEHEER</span><h1>CSV-import</h1><p>Upload bestaande CSV-bestanden. Dubbele records worden overgeslagen.</p></div></div><div className="panel-body">{sets.map(s => <label key={s} className="field"><strong>{s}</strong><input type="file" accept=".csv" onChange={upload} disabled={busy} /></label>)}{result && <p role="status">{result}</p>}</div></section>;
}
