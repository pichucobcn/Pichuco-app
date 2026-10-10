import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="login">
      <div className="box">
        <img src="/brand/logo.svg" alt="Pichuco — Pizzería Porteña" className="logo" />
        <p className="tagline">Hablale a Pichuco. Pichuco se encarga.</p>
        <img src="/brand/pichuco.svg" alt="" className="mascot" />
        <LoginForm demo={process.env.PICHUCO_DEMO_OTP === "1"} />
      </div>
    </main>
  );
}
