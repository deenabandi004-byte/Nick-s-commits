import { getSchoolMeta, getUniversityShortName } from "@/lib/universityUtils";

interface SchoolTitle {
  lead: string;
  accent: string;
}

export function useSchoolTitle(
  university: string | null | undefined,
  variant: "companies" | "people" = "companies"
): SchoolTitle {
  const meta = getSchoolMeta(university);
  const shortName = getUniversityShortName(university);

  if (meta) {
    const verb = variant === "companies" ? "landed." : "went.";
    return {
      lead: `Where ${meta.demonym} have`,
      accent: verb,
    };
  }

  if (shortName) {
    const verb = variant === "companies" ? "went." : "went.";
    return {
      lead: `Where your ${shortName} network`,
      accent: verb,
    };
  }

  // No school - return existing generic title
  return {
    lead: "Who do you want to",
    accent: "meet?",
  };
}
