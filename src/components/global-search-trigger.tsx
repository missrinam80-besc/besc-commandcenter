"use client";

import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

export function GlobalSearchTrigger({ active = false }: { active?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        dialog.current?.showModal();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  return (
    <>
      <button className={active ? "active global-search-button" : "global-search-button"} type="button" onClick={() => dialog.current?.showModal()}>
        <Search size={17}/><span>Zoeken</span><kbd>Ctrl K</kbd>
      </button>
      <dialog className="global-search-dialog" ref={dialog} onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}>
        <form action="/app/zoeken" method="get">
          <Search size={20}/>
          <input name="zoeken" autoFocus minLength={2} required placeholder="Zoek in heel BESC…"/>
          <button aria-label="Sluiten" type="button" onClick={() => dialog.current?.close()}><X size={18}/></button>
        </form>
        <p>Zoek door taken, projecten, content, events, sponsors, kennis en meer.</p>
      </dialog>
    </>
  );
}
