import { requireUserPage } from "@/lib/auth";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { getPolicy } from "@/lib/services/purchases";
import { listTeam } from "@/lib/services/team";
import { PageTitle } from "@/components/PageTitle";
import { NoAccess } from "@/components/NoAccess";
import { PolicyForm } from "./PolicyForm";

export default async function ReglasPage() {
  const user = await requireUserPage();
  if (!can(user, "configuracion")) return <NoAccess title="Reglas de compra" who="Martín" />;
  const [policy, team] = await Promise.all([getPolicy(), listTeam()]);
  return (
    <main>
      <PageTitle title="Reglas de compra" back="/compras" />
      <PolicyForm
        policy={{ autoLimit: policy.autoLimit, managerLimit: policy.managerLimit, alwaysApprove: policy.alwaysApprove }}
        users={team
          .filter((u) => can(u, "compras"))
          .map((u) => ({ id: u.id, name: u.shortName, role: ROLE_LABEL[u.role], limit: u.purchaseAutoLimit }))}
      />
    </main>
  );
}
