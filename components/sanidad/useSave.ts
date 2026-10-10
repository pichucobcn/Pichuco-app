"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

/** Envía una operación de sanidad y refresca la página. */
export function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function save<T = unknown>(op: string, body: object): Promise<T | null> {
    setBusy(true);
    setError(undefined);
    try {
      const r = await api<T>(`/api/sanidad/${op}`, body);
      router.refresh();
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { save, busy, error, setError };
}
