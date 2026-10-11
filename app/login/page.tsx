import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="login">
      <div className="box">
        <div className="poster fileteado">
          <img src="/brand/pichuco.png" alt="Pichuco — Pizzería Porteña" className="mascot" />
        </div>
        <div className="guarda" aria-hidden="true" />
        <LoginForm demo={process.env.PICHUCO_DEMO_OTP === "1"} needsAccessCode={!!process.env.PICHUCO_ACCESS_CODE} />
      </div>
    </main>
  );
}
