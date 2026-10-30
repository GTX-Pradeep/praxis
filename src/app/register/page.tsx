import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "Create account" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;
  return (
    <AuthShell title="Create your account" subtitle="Students build a verified profile; labs post openings.">
      <RegisterForm initialRole={role === "faculty" ? "faculty" : "student"} />
    </AuthShell>
  );
}
