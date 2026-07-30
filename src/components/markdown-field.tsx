"use client";

import { Bold, Eye, Italic, Link2, List, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { Streamdown } from "streamdown";

type MarkdownFieldProps = {
  name: string;
  defaultValue?: string | null;
  rows?: number;
  placeholder?: string;
  label?: string;
};

export function MarkdownField({
  name,
  defaultValue = "",
  rows = 6,
  placeholder,
  label,
}: MarkdownFieldProps) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [preview, setPreview] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  function wrap(prefix: string, suffix = prefix, fallback = "tekst") {
    const element = textarea.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    const next = `${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`;
    setValue(next);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  function prefixLines(prefix: string) {
    const element = textarea.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = value.slice(start, end) || "item";
    const replacement = selected.split("\n").map((line) => `${prefix}${line}`).join("\n");
    setValue(`${value.slice(0, start)}${replacement}${value.slice(end)}`);
    requestAnimationFrame(() => element.focus());
  }

  return (
    <label className="markdown-field">
      {label && <span className="markdown-field-label">{label}</span>}
      <span className="markdown-toolbar">
        <button type="button" title="Vet" onClick={() => wrap("**")}><Bold size={14}/></button>
        <button type="button" title="Cursief" onClick={() => wrap("_")}><Italic size={14}/></button>
        <button type="button" title="Lijst" onClick={() => prefixLines("- ")}><List size={14}/></button>
        <button type="button" title="Link" onClick={() => wrap("[", "](https://)", "linktekst")}><Link2 size={14}/></button>
        <button type="button" className={preview ? "active" : ""} onClick={() => setPreview((current) => !current)}>
          {preview ? <Pencil size={14}/> : <Eye size={14}/>}
          {preview ? "Bewerken" : "Voorbeeld"}
        </button>
        <small>Markdown</small>
      </span>
      {preview
        ? <div className="markdown-preview"><Streamdown>{value || "*Nog geen tekst*"}</Streamdown></div>
        : <textarea
            ref={textarea}
            name={name}
            rows={rows}
            value={value}
            placeholder={placeholder}
            onChange={(event) => setValue(event.target.value)}
          />}
      {preview && <input type="hidden" name={name} value={value}/>}
    </label>
  );
}

export function MarkdownContent({ children }: { children?: string | null }) {
  if (!children) return null;
  return <div className="markdown-content"><Streamdown>{children}</Streamdown></div>;
}
