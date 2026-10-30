import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthShell title="Welcome back" subtitle="Log in to your student, faculty or admin account.">
      <LoginForm next={next} />
    </AuthShell>
  );
}
