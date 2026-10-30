import { z } from "zod";

// App-side validation gives friendly messages early; the database CHECK
// constraints and triggers remain the final guard.

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(255);
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")      // bcrypt limit
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number");
const fullName = z.string().trim().min(2, "Enter your full name").max(120);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

export const studentRegisterSchema = z.object({
  role: z.literal("student"),
  email,
  password,
  fullName,
  srn: z.string().trim().toUpperCase().min(5, "Enter your SRN").max(20),
  branch: z.string().trim().min(2, "Enter your branch").max(60),
  semester: z.coerce.number().int().min(1).max(8),
  cgpa: z.coerce.number().min(0).max(10),
  githubUsername: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, "Not a valid GitHub username")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

// A faculty member either joins an existing research center (centerId) or
// creates their own (newCenterName), in which case they become its head.
export const facultyRegisterSchema = z
  .object({
    role: z.literal("faculty"),
    email,
    password,
    fullName,
    designation: z.string().trim().max(80).optional(),
    centerId: z.preprocess(
      (v) => (v === "" || v === "new" || v === undefined ? undefined : v),
      z.coerce.number().int().positive().optional()
    ),
    newCenterName: z.string().trim().max(150).optional().or(z.literal("").transform(() => undefined)),
    newCenterDescription: z.string().trim().max(1000).optional().or(z.literal("").transform(() => undefined)),
  })
  .refine((d) => d.centerId !== undefined || (d.newCenterName?.length ?? 0) >= 3, {
    message: "Choose your research center, or enter your lab's name (at least 3 characters)",
  });

export const registerSchema = z.discriminatedUnion("role", [studentRegisterSchema, facultyRegisterSchema]);

export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}
