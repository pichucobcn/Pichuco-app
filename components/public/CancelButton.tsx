"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

export function CancelButton({ url, label, confirm }: { url: string; label: string; confirm: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div style={{ marginTop: 14, textAlign: "center" }}>
      <button
        className="btn secondary"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(confirm)) return;
          setBusy(true);
          try {
            await api(url);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {label}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
