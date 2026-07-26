"use client";

import Link from "next/link";
import { Download } from "lucide-react";

export function ManagementReportActions({ exportHref }: { exportHref: string }) {
  return <><Link className="row-action" href={exportHref}><Download size={14}/>CSV</Link><button className="row-action management-print" type="button" onClick={() => window.print()}><Download size={14}/>Bewaar als PDF</button></>;
}
