export const GUC_DOMAIN = "guc.edu.eg";
export const STUDENT_DOMAIN = "student.guc.edu.eg";
export const INSTRUCTOR_DOMAIN = "guc.edu.eg";

export function isGucEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return e.endsWith("@" + GUC_DOMAIN) || e.endsWith("@" + STUDENT_DOMAIN);
}

export function isStudentEmail(email: string): boolean {
  return email
    .trim()
    .toLowerCase()
    .endsWith("@" + STUDENT_DOMAIN);
}

export function isInstructorEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  // Instructor must be @guc.edu.eg but NOT @student.guc.edu.eg
  return e.endsWith("@" + INSTRUCTOR_DOMAIN) && !e.endsWith("@" + STUDENT_DOMAIN);
}

export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    student: "Student",
    instructor: "Course Instructor",
    employer: "Employer",
    admin: "Administrator",
  };
  return map[role] ?? role;
}

export function fullName(p: {
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  email?: string | null;
}): string {
  if (p.company_name) return p.company_name;
  const n = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return n || p.email || "—";
}
