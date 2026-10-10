import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="login">
      <div className="box">
        <div className="poster">
          <img src="/brand/pichuco.png" alt="Pichuco — Pizzería Porteña" className="mascot" />
          <p className="tagline">Hablale a Pichuco. Pichuco se encarga.</p>
        </div>
        <LoginForm demo={process.env.PICHUCO_DEMO_OTP === "1"} />
      </div>
    </main>
  );
}
