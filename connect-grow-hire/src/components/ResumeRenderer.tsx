import React from 'react';

interface Experience {
  company: string;
  title: string;
  location?: string;
  dates?: string;
  bullets: string[];
}

interface Education {
  university: string;
  location?: string;
  degree: string;
  major: string;
  graduation: string;
  coursework?: string[];
  gpa?: string;
  honors?: string[];
}

interface Skills {
  programming_languages?: string[];
  tools_frameworks?: string[];
  core_skills?: string[];
  databases?: string[];
  cloud_devops?: string[];
  soft_skills?: string[];
  languages?: string[];
}

interface Project {
  name: string;
  description: string;
  technologies?: string[];
  date?: string;
}

interface Extracurricular {
  activity: string;
  role?: string;
  description?: string;
  organization?: string;
}

interface Contact {
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

interface ResumeData {
  name?: string;
  contact?: Contact;
  Summary?: string;
  Experience?: Experience[];
  Education?: Education;
  Skills?: Skills;
  Projects?: Project[];
  Extracurriculars?: Extracurricular[];
}

interface ResumeRendererProps {
  resume: ResumeData | string;
  className?: string;
}

const ResumeRenderer: React.FC<ResumeRendererProps> = ({ resume, className = '' }) => {
  // If resume is a string, render it as plain text (fallback for old format)
  if (typeof resume === 'string') {
    return (
      <div className={`resume-renderer bg-white text-gray-900 ${className}`}>
        <pre className="text-sm whitespace-pre-wrap font-mono p-4">{resume}</pre>
      </div>
    );
  }

  // Helper to check if a section has content
  const hasContent = (arr?: any[]) => arr && arr.length > 0;
  const hasSkills = (skills?: Skills) => {
    if (!skills) return false;
    return Object.values(skills).some(arr => arr && arr.length > 0);
  };

  return (
    <div className={`resume-renderer bg-white text-gray-900 ${className}`}>
      {/* Header / Contact */}
      <header className="text-center border-b-2 border-gray-300 pb-4 mb-4">
        {resume.name && (
          <h1 className="text-2xl font-bold uppercase tracking-wide mb-2">
            {resume.name}
          </h1>
        )}
        {resume.contact && (
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-gray-600">
            {resume.contact.location && <span>{resume.contact.location}</span>}
            {resume.contact.email && (
              <a href={`mailto:${resume.contact.email}`} className="hover:text-[#3B82F6]">
                {resume.contact.email}
              </a>
            )}
            {resume.contact.phone && <span>{resume.contact.phone}</span>}
            {resume.contact.linkedin && (
              <a href={resume.contact.linkedin.startsWith('http') ? resume.contact.linkedin : `https://${resume.contact.linkedin}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#3B82F6]">
                LinkedIn
              </a>
            )}
            {resume.contact.github && (
              <a href={resume.contact.github} target="_blank" rel="noopener noreferrer" className="hover:text-[#3B82F6]">
                GitHub
              </a>
            )}
          </div>
        )}
      </header>

      {/* Summary */}
      {resume.Summary && (
        <section className="mb-4">
          <h2 className="text-lg font-bold uppercase tracking-wide border-b border-gray-300 mb-2">
            Summary
          </h2>
          <p className="text-sm leading-relaxed">{resume.Summary}</p>
        </section>
      )}

      {/* Education */}
      {resume.Education && (
        <section className="mb-4">
          <h2 className="text-lg font-bold uppercase tracking-wide border-b border-gray-300 mb-2">
            Education
          </h2>
          <div className="mb-2">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold">{resume.Education.university}</h3>
                <p className="text-sm">
                  {resume.Education.degree} in {resume.Education.major}
                </p>
              </div>
              <div className="text-right text-sm">
                {resume.Education.location && <p>{resume.Education.location}</p>}
                <p>{resume.Education.graduation}</p>
              </div>
            </div>
            {resume.Education.gpa && (
              <p className="text-sm mt-1">GPA: {resume.Education.gpa}</p>
            )}
            {hasContent(resume.Education.honors) && (
              <p className="text-sm mt-1">
                <span className="font-medium">Honors:</span> {resume.Education.honors!.join(', ')}
              </p>
            )}
            {hasContent(resume.Education.coursework) && (
              <p className="text-sm mt-1">
                <span className="font-medium">Relevant Coursework:</span>{' '}
                {resume.Education.coursework!.join(', ')}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Experience */}
      {hasContent(resume.Experience) && (
        <section className="mb-4">
          <h2 className="text-lg font-bold uppercase tracking-wide border-b border-gray-300 mb-2">
            Experience
          </h2>
          {resume.Experience!.map((exp, index) => (
            <div key={index} className="mb-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{exp.title}</h3>
                  <p className="text-sm text-gray-700">{exp.company}</p>
                </div>
                <div className="text-right text-sm text-gray-600">
                  {exp.location && <p>{exp.location}</p>}
                  {exp.dates && <p>{exp.dates}</p>}
                </div>
              </div>
              {hasContent(exp.bullets) && (
                <ul className="mt-1 ml-4 text-sm list-disc list-outside space-y-1">
                  {exp.bullets.map((bullet, bulletIndex) => (
                    <li key={bulletIndex}>{bullet}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Projects */}
      {hasContent(resume.Projects) && (
        <section className="mb-4">
          <h2 className="text-lg font-bold uppercase tracking-wide border-b border-gray-300 mb-2">
            Projects
          </h2>
          {resume.Projects!.map((project, index) => (
            <div key={index} className="mb-2">
              <div className="flex justify-between items-start">
                <h3 className="font-semibold text-sm">{project.name}</h3>
                {project.date && (
                  <span className="text-sm text-gray-600">{project.date}</span>
                )}
              </div>
              <p className="text-sm mt-1">{project.description}</p>
              {hasContent(project.technologies) && (
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">Technologies:</span>{' '}
                  {project.technologies!.join(', ')}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Skills */}
      {hasSkills(resume.Skills) && (
        <section className="mb-4">
          <h2 className="text-lg font-bold uppercase tracking-wide border-b border-gray-300 mb-2">
            Skills
          </h2>
          <div className="text-sm space-y-1">
            {hasContent(resume.Skills!.programming_languages) && (
              <p>
                <span className="font-medium">Programming:</span>{' '}
                {resume.Skills!.programming_languages!.join(', ')}
              </p>
            )}
            {hasContent(resume.Skills!.tools_frameworks) && (
              <p>
                <span className="font-medium">Tools & Frameworks:</span>{' '}
                {resume.Skills!.tools_frameworks!.join(', ')}
              </p>
            )}
            {hasContent(resume.Skills!.databases) && (
              <p>
                <span className="font-medium">Databases:</span>{' '}
                {resume.Skills!.databases!.join(', ')}
              </p>
            )}
            {hasContent(resume.Skills!.cloud_devops) && (
              <p>
                <span className="font-medium">Cloud & DevOps:</span>{' '}
                {resume.Skills!.cloud_devops!.join(', ')}
              </p>
            )}
            {hasContent(resume.Skills!.core_skills) && (
              <p>
                <span className="font-medium">Core Skills:</span>{' '}
                {resume.Skills!.core_skills!.join(', ')}
              </p>
            )}
            {hasContent(resume.Skills!.languages) && (
              <p>
                <span className="font-medium">Languages:</span>{' '}
                {resume.Skills!.languages!.join(', ')}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Extracurriculars */}
      {hasContent(resume.Extracurriculars) && (
        <section className="mb-4">
          <h2 className="text-lg font-bold uppercase tracking-wide border-b border-gray-300 mb-2">
            Activities & Interests
          </h2>
          <ul className="text-sm list-disc list-inside space-y-1">
            {resume.Extracurriculars!.map((extra, index) => (
              <li key={index}>
                <span className="font-medium">{extra.activity}</span>
                {extra.role && ` - ${extra.role}`}
                {extra.description && `: ${extra.description}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default ResumeRenderer;

