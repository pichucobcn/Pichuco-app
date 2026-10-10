import Link from "next/link";
import { Icon } from "./Icon";

export function PageTitle({ title, back = "/" }: { title: string; back?: string | null }) {
  return (
    <div className="page-title">
      {back && (
        <Link href={back} className="back" aria-label="Volver">
          <Icon name="back" />
        </Link>
      )}
      <h1>{title}</h1>
    </div>
  );
}
