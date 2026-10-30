// Rename the project here — every page reads the name from this file.
export const APP_NAME = "Praxis";
export const APP_TAGLINE = "Proof-based research talent matching";

export type Role = "admin" | "faculty" | "student";

export const DASHBOARD: Record<Role, string> = {
  admin: "/admin",
  faculty: "/faculty",
  student: "/student",
};
