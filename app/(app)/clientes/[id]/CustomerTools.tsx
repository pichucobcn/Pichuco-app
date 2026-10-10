"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

export function CustomerTools({ id, notes }: { id: string; notes: string }) {
  const router = useRouter();
  const [text, setText] = useState(notes);
  const [saved, setSaved] = useState(false);
  return (
    <div className="stack">
      <div className="field">
        <label>Notas internas</label>
        <textarea
          className="input"
          rows={2}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          placeholder="Alergias, mesa preferida…"
          maxLength={1000}
        />
      </div>
      <div className="row">
        <button
          className="btn small"
          onClick={async () => {
            await api(`/api/customers/${id}`, { notes: text }, "PATCH");
            setSaved(true);
          }}
        >
          {saved ? "Guardado" : "Guardar notas"}
        </button>
        <span className="spacer" />
        <button
          className="btn small ghost"
          onClick={async () => {
            if (!window.confirm("Se borran nombre, teléfono, email y notas de este cliente (se conserva el historial sin datos personales). ¿Seguir?")) return;
            await api(`/api/customers/${id}`, undefined, "DELETE");
            router.push("/clientes");
            router.refresh();
          }}
        >
          Borrar datos personales
        </button>
      </div>
    </div>
  );
}
