import { redirect } from "next/navigation";
import { getCurrentUser, MIN_PASSWORD } from "@/lib/auth";
import { loginRoster } from "@/lib/services/team";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="login">
      <div className="box">
        <div className="poster">
          <img src="/brand/pichuco.png" alt="Pichuco — Pizzería Porteña" className="mascot" />
        </div>
        <LoginForm people={await loginRoster()} minPassword={MIN_PASSWORD} />
      </div>
    </main>
  );
}
