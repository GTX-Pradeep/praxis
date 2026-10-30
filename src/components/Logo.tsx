import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-accent font-serif text-sm font-bold text-paper">
        {APP_NAME.charAt(0)}
      </span>
      <span className="font-serif text-xl font-semibold tracking-tight">{APP_NAME}</span>
    </Link>
  );
}
