"use client";

import { Download } from "lucide-react";

export function ManagementReportActions() {
  return <button className="row-action management-print" type="button" onClick={() => window.print()}><Download size={14}/>Bewaar als PDF</button>;
}
