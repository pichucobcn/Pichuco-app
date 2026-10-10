"use client";
import { useState } from "react";
import { api } from "@/components/api";

export function PayButton({ code, total }: { code: string; total: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <button
        className="btn block"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api<{ payUrl: string }>(`/api/public/takeaway/${code}/pay`);
            window.location.href = r.payUrl;
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        Pagar {total}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
