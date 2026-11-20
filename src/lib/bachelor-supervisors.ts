export interface BachelorSupervisor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export const BACHELOR_SUPERVISORS_BY_COURSE_CODE: Record<string, BachelorSupervisor> = {
  CS101: {
    id: "00000000-0000-0000-0000-000000000003",
    firstName: "Amr",
    lastName: "Elwan",
    email: "amr.elwan@guc.edu.eg",
  },
  CS202: {
    id: "00000000-0000-0000-0000-000000000005",
    firstName: "Aya",
    lastName: "Salem",
    email: "aya.salem@guc.edu.eg",
  },
  SE301: {
    id: "00000000-0000-0000-0000-000000000006",
    firstName: "Karim",
    lastName: "Mohamed",
    email: "karim.mohamed@guc.edu.eg",
  },
  CS303: {
    id: "00000000-0000-0000-0000-000000000007",
    firstName: "Mina",
    lastName: "Fahmy",
    email: "mina.fahmy@guc.edu.eg",
  },
};

export function getBachelorSupervisorCourseCodes(userId?: string) {
  if (!userId) return [];
  return Object.entries(BACHELOR_SUPERVISORS_BY_COURSE_CODE)
    .filter(([, supervisor]) => supervisor.id === userId)
    .map(([courseCode]) => courseCode);
}

export function isBachelorSupervisorForCourseCode(courseCode: string | null | undefined, userId?: string) {
  return !!courseCode && !!userId && BACHELOR_SUPERVISORS_BY_COURSE_CODE[courseCode]?.id === userId;
}
