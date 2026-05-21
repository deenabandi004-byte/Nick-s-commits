import type { ParsedResume } from '@/types/resume';

/**
 * Generate a plain-text version of the structured resume for downstream use
 * (email generation, search, etc.). Written to Firestore as resumeText.
 */
export function generatePlainTextResume(data: ParsedResume | null): string {
  if (!data) return '';

  const lines: string[] = [];

  if (data.name) {
    lines.push(data.name.toUpperCase());
    lines.push('');
  }

  const contactParts: string[] = [];
  if (data.contact) {
    if (data.contact.email) contactParts.push(data.contact.email);
    if (data.contact.phone) contactParts.push(data.contact.phone);
    if (data.contact.location) contactParts.push(data.contact.location);
    if (data.contact.linkedin) contactParts.push(data.contact.linkedin);
    if (data.contact.github) contactParts.push(data.contact.github);
    if (data.contact.website) contactParts.push(data.contact.website);
  }
  if (contactParts.length) {
    lines.push(contactParts.join(' | '));
    lines.push('');
  }

  if (data.objective && data.objective.trim()) {
    lines.push('SUMMARY');
    lines.push(data.objective.trim());
    lines.push('');
  }

  if (data.education && data.education.length > 0) {
    lines.push('EDUCATION');
    for (const edu of data.education) {
      const parts: string[] = [];
      if (edu.university) parts.push(edu.university);
      if (edu.degree || edu.major) parts.push([edu.degree, edu.major].filter(Boolean).join(' in '));
      if (edu.graduation) parts.push(edu.graduation);
      if (edu.location) parts.push(edu.location);
      if (edu.gpa) parts.push(`GPA: ${edu.gpa}`);
      if (parts.length) lines.push(parts.join(' | '));
    }
    lines.push('');
  }

  if (data.experience && data.experience.length > 0) {
    lines.push('EXPERIENCE');
    for (const exp of data.experience) {
      if (exp.title || exp.company) {
        lines.push(`${exp.title || ''} at ${exp.company || ''}`);
        if (exp.dates || exp.location) lines.push([exp.dates, exp.location].filter(Boolean).join(' | '));
      }
      if (exp.bullets && exp.bullets.length) {
        for (const b of exp.bullets) if (b && b.trim()) lines.push(`• ${b.trim()}`);
      }
    }
    lines.push('');
  }

  if (data.projects && data.projects.length > 0) {
    lines.push('PROJECTS');
    for (const proj of data.projects) {
      if (proj.name) lines.push(proj.name);
      if (proj.description) lines.push(proj.description);
      if (proj.technologies) lines.push(`Technologies: ${proj.technologies}`);
      if (proj.date || proj.link) lines.push([proj.date, proj.link].filter(Boolean).join(' | '));
    }
    lines.push('');
  }

  if (data.skills && Object.keys(data.skills).length > 0) {
    lines.push('SKILLS');
    for (const [category, values] of Object.entries(data.skills)) {
      if (values && values.length) {
        const label = category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        lines.push(`${label}: ${values.join(', ')}`);
      }
    }
    lines.push('');
  }

  if (data.extracurriculars && data.extracurriculars.length > 0) {
    lines.push('ACTIVITIES & INTERESTS');
    for (const e of data.extracurriculars) {
      const parts = [e.organization || e.activity, e.role, e.dates].filter(Boolean);
      if (parts.length) lines.push(parts.join(' - '));
      if (e.description) lines.push(e.description);
    }
    lines.push('');
  }

  if (data.certifications && data.certifications.length > 0) {
    lines.push('CERTIFICATIONS');
    for (const c of data.certifications) {
      if (typeof c === 'string') lines.push(c);
      else if (c && typeof c === 'object' && (c as { name?: string }).name) lines.push((c as { name: string }).name);
    }
  }

  return lines.join('\n').trim();
}
