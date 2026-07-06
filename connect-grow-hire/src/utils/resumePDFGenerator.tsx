/**
 * Generate a PDF blob from structured resume data using @react-pdf/renderer.
 * Used by ResumePage (save + download) and Application Lab (edited resume PDF).
 */
import { pdf } from '@react-pdf/renderer';
import ResumePDF from '@/components/ResumePDF';
import type { ParsedResume } from '@/types/resume';

/** Convert ParsedResume to the format expected by ResumePDF (PascalCase, single Education) */
export function parseResumeToPdfPayload(data: ParsedResume | null): any {
  if (!data) return null;
  const education = data.education?.[0];
  const projects = (data.projects || []).map((p) => ({
    name: p.name,
    description: p.description,
    technologies:
      typeof p.technologies === 'string'
        ? p.technologies
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : Array.isArray(p.technologies)
          ? p.technologies
          : [],
    date: p.date,
  }));
  const extracurriculars = (data.extracurriculars || []).map((e) => ({
    activity: e.organization || e.activity || e.role,
    role: e.role,
    description: e.description,
  }));
  return {
    name: data.name,
    contact: data.contact,
    Summary: data.objective,
    Experience: data.experience || [],
    Education: education
      ? {
          university: education.university,
          degree: education.degree,
          major: education.major,
          graduation: education.graduation,
          gpa: education.gpa,
          location: education.location,
          coursework: education.coursework,
          honors: education.honors,
        }
      : undefined,
    Skills: data.skills || undefined,
    Projects: projects,
    Extracurriculars: extracurriculars,
  };
}

/**
 * Generate a PDF blob from structured resume data.
 * Use for download or upload to Storage.
 */
export async function generateResumePDF(data: ParsedResume): Promise<Blob> {
  const payload = parseResumeToPdfPayload(data);
  if (!payload) throw new Error('Invalid resume data');
  const blob = await pdf(<ResumePDF resume={payload} />).toBlob();
  return blob;
}
