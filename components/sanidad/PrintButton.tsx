"use client";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <button className="btn block" onClick={() => window.print()}>
      {label}
    </button>
  );
}
