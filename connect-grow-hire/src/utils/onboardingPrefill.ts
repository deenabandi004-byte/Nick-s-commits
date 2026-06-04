/**
 * Onboarding prefill helpers.
 *
 * Maps the `/api/parse-resume` response into the fields the onboarding Confirm
 * step prefills. The parse route nests academics under
 * `data.education.{university,major,graduation}` (see backend
 * `parse_resume_info`); earlier code read flat `data.{year,major,university}`,
 * which the endpoint never returns — so academics prefill silently failed
 * (Bug 1). Centralized here so the Profile upload handler, the final submit
 * gap-fill, and the Confirm step all read the same correct shape.
 */

export interface ResumePrefill {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  university: string;
  major: string;
  graduationYear: string;
}

/** Pull a 4-digit graduation year out of a freeform date like "May 2026". */
export function extractGraduationYear(graduation?: string | null): string {
  if (!graduation) return "";
  const match = String(graduation).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : "";
}

/**
 * Normalize the `/api/parse-resume` response `data` object into prefill fields.
 * Reads the nested `education` and `contact` objects the backend actually returns.
 */
export function resumePrefillFromParse(data: unknown): ResumePrefill {
  const d = (data || {}) as Record<string, any>;
  const edu = (d.education || {}) as Record<string, any>;
  const contact = (d.contact || {}) as Record<string, any>;
  const name = (d.name || "").trim();
  const parts = name ? name.split(/\s+/) : [];
  return {
    name,
    firstName: parts[0] || "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
    email: contact.email || "",
    phone: contact.phone || "",
    university: edu.university || "",
    major: edu.major || "",
    graduationYear: extractGraduationYear(edu.graduation),
  };
}

export const EMPTY_PREFILL: ResumePrefill = {
  name: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  university: "",
  major: "",
  graduationYear: "",
};

/**
 * Map the `/api/enrich-linkedin-onboarding` response into prefill fields.
 * The route returns `profile.{firstName,lastName,email,phone}` and
 * `academics.{university,major,degree,graduationYear}` (graduationYear is the
 * raw `education.graduation` string, e.g. "May 2026"). Bug 2's education
 * backfill is what makes the academics block reliably populated.
 */
export function prefillFromLinkedin(result: unknown): ResumePrefill {
  const r = (result || {}) as Record<string, any>;
  const profile = (r.profile || {}) as Record<string, any>;
  const academics = (r.academics || {}) as Record<string, any>;
  const firstName = profile.firstName || "";
  const lastName = profile.lastName || "";
  const name = [firstName, lastName].filter(Boolean).join(" ");
  return {
    name,
    firstName,
    lastName,
    email: profile.email || "",
    phone: profile.phone || "",
    university: academics.university || "",
    major: academics.major || "",
    graduationYear: extractGraduationYear(academics.graduationYear),
  };
}

/**
 * Single-resolver precedence (approved): resume present -> LinkedIn fills gaps
 * -> empty for manual. Resume-only = resume without linkedin; LinkedIn-only =
 * linkedin without resume; manual = both null -> EMPTY_PREFILL (Confirm opens
 * blank for the required-field gate).
 */
export function resolvePrefill(
  resume: ResumePrefill | null,
  linkedin: ResumePrefill | null
): ResumePrefill {
  const r = resume || EMPTY_PREFILL;
  const l = linkedin || EMPTY_PREFILL;
  const pick = (key: keyof ResumePrefill) => r[key] || l[key] || "";
  return {
    name: pick("name"),
    firstName: pick("firstName"),
    lastName: pick("lastName"),
    email: pick("email"),
    phone: pick("phone"),
    university: pick("university"),
    major: pick("major"),
    graduationYear: pick("graduationYear"),
  };
}
