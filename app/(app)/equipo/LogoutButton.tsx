"use client";
import { api } from "@/components/api";
import { Icon } from "@/components/Icon";

export function LogoutButton() {
  return (
    <button
      className="btn dark"
      onClick={async () => {
        await api("/api/auth/logout").catch(() => null);
        window.location.href = "/login";
      }}
    >
      <Icon name="logout" /> Cerrar sesión
    </button>
  );
}
