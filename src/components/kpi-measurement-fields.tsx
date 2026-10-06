"use client";

import { useState } from "react";

export function KpiMeasurementFields({ value, status = "measured" }: { value?: unknown; status?: string }) {
  const [missing, setMissing] = useState(status === "missing");
  return <>
    <label>Meetstatus<select name="measurement_status" defaultValue={status} onChange={(event) => setMissing(event.target.value === "missing")}>
      <option value="measured">Gemeten</option><option value="missing">Ontbrekende meting</option>
    </select></label>
    <label>Waarde<input type="number" step="0.0001" name="value" required={!missing} disabled={missing} defaultValue={value == null ? "" : String(value)}/></label>
  </>;
}
