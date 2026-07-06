/**
 * Parsed resume structure matching backend parse_resume_info and Firestore resumeParsed.
 * Backend returns education as a single object; we use array in the editor for multiple entries.
 */
export interface ParsedResumeContact {
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
}

export interface ParsedResumeEducationEntry {
  university: string;
  degree: string;
  major: string;
  graduation: string;
  gpa: string;
  location: string;
  coursework?: string[];
  honors?: string[];
  minor?: string;
}

export interface ParsedResumeExperienceEntry {
  company: string;
  title: string;
  dates: string;
  location: string;
  bullets: string[];
}

export interface ParsedResumeProjectEntry {
  name: string;
  description: string;
  technologies: string; // comma-separated or JSON array; editor uses string
  date: string;
  link: string;
}

export interface ParsedResumeExtracurricularEntry {
  organization: string;
  role: string;
  dates: string;
  description: string;
  activity?: string; // backend may use activity
}

export interface ParsedResumeCertification {
  name: string;
  issuer?: string;
  date?: string;
  expiry?: string;
}

/** Skills keyed by category (backend uses snake_case keys) */
export type ParsedResumeSkills = Record<string, string[]>;

export interface ParsedResume {
  name: string;
  contact: ParsedResumeContact;
  objective: string;
  /** Editor uses array; backend may return single object — normalize on load/save */
  education: ParsedResumeEducationEntry[];
  experience: ParsedResumeExperienceEntry[];
  projects: ParsedResumeProjectEntry[];
  skills: ParsedResumeSkills;
  extracurriculars: ParsedResumeExtracurricularEntry[];
  certifications: ParsedResumeCertification[] | string[];
}

/** Empty template for "build from scratch" */
export function emptyParsedResume(): ParsedResume {
  return {
    name: '',
    contact: {
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      github: '',
      website: '',
    },
    objective: '',
    education: [],
    experience: [],
    projects: [],
    skills: {},
    extracurriculars: [],
    certifications: [],
  };
}

/** Normalize Firestore/API data (education may be object) into editor shape (education array) */
export function normalizeParsedResumeFromFirestore(data: any): ParsedResume | null {
  if (!data || typeof data !== 'object') return null;
  const edu = data.education;
  const educationArray = Array.isArray(edu)
    ? edu
    : edu && typeof edu === 'object'
      ? [{
          university: edu.university ?? '',
          degree: edu.degree ?? '',
          major: edu.major ?? '',
          graduation: edu.graduation ?? '',
          gpa: edu.gpa ?? '',
          location: edu.location ?? '',
          coursework: Array.isArray(edu.coursework) ? edu.coursework : [],
          honors: Array.isArray(edu.honors) ? edu.honors : [],
          minor: edu.minor ?? '',
        }]
      : [];
  return {
    name: data.name ?? '',
    contact: {
      email: data.contact?.email ?? '',
      phone: data.contact?.phone ?? '',
      location: data.contact?.location ?? '',
      linkedin: data.contact?.linkedin ?? '',
      github: data.contact?.github ?? '',
      website: data.contact?.website ?? '',
    },
    objective: data.objective ?? data.summary ?? '',
    education: educationArray,
    experience: Array.isArray(data.experience) ? data.experience : [],
    projects: Array.isArray(data.projects)
      ? data.projects.map((p: any) => ({
          name: p.name ?? '',
          description: p.description ?? '',
          technologies: Array.isArray(p.technologies) ? p.technologies.join(', ') : (p.technologies ?? ''),
          date: p.date ?? '',
          link: p.link ?? '',
        }))
      : [],
    skills: data.skills && typeof data.skills === 'object' ? data.skills : {},
    extracurriculars: Array.isArray(data.extracurriculars) ? data.extracurriculars : [],
    certifications: Array.isArray(data.certifications) ? data.certifications : [],
  };
}
