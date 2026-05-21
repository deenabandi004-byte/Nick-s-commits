import React from 'react';
import { Copy, Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import ResumePDFDownload from './ResumePDFDownload';

interface ResumeActionsProps {
  resumeData: any;
  resumeRef?: React.RefObject<HTMLDivElement>;
  className?: string;
}

const ResumeActions: React.FC<ResumeActionsProps> = ({ 
  resumeData,
  resumeRef,
  className = '' 
}) => {
  
  // Copy as plain text
  const handleCopy = async () => {
    const plainText = convertToPlainText(resumeData);
    try {
      await navigator.clipboard.writeText(plainText);
      toast({ 
        title: "Resume copied!", 
        description: "Resume copied to clipboard" 
      });
    } catch (err) {
      toast({ 
        title: "Failed to copy", 
        description: "Failed to copy resume to clipboard",
        variant: "destructive"
      });
    }
  };

  // Print (opens browser print dialog)
  const handlePrint = () => {
    window.print();
  };

  // Download as text file
  const handleDownloadTxt = () => {
    const plainText = convertToPlainText(resumeData);
    const blob = new Blob([plainText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'optimized_resume.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast({ 
      title: "Resume downloaded!", 
      description: "Resume downloaded successfully" 
    });
  };

  // Generate filename
  const name = resumeData?.name || resumeData?.Name || 'Resume';
  const filename = `${name.replace(/\s+/g, '_')}_optimized.pdf`;

  return (
    <div className={`flex gap-2 ${className}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="flex items-center gap-2"
      >
        <Copy size={16} />
        Copy
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handlePrint}
        className="flex items-center gap-2"
      >
        <Printer size={16} />
        Print
      </Button>
      <ResumePDFDownload
        resume={resumeData}
        fileName={filename}
      />
      <Button
        variant="default"
        size="sm"
        onClick={handleDownloadTxt}
        className="flex items-center gap-2"
      >
        <Download size={16} />
        Download TXT
      </Button>
    </div>
  );
};

// Convert resume JSON to plain text
function convertToPlainText(resume: any): string {
  // If it's already a string, return it
  if (typeof resume === 'string') {
    return resume;
  }

  // Handle content field (for old format)
  if (resume.content) {
    return resume.content;
  }

  const lines: string[] = [];
  
  // Header
  if (resume.name) {
    lines.push(resume.name.toUpperCase());
  }
  if (resume.contact) {
    const contactParts = [];
    if (resume.contact.location) contactParts.push(resume.contact.location);
    if (resume.contact.email) contactParts.push(resume.contact.email);
    if (resume.contact.phone) contactParts.push(resume.contact.phone);
    if (contactParts.length > 0) {
      lines.push(contactParts.join(' | '));
    }
  }
  lines.push('');

  // Summary
  if (resume.Summary || resume.summary) {
    lines.push('SUMMARY');
    lines.push(resume.Summary || resume.summary);
    lines.push('');
  }

  // Education
  const education = resume.Education || resume.education;
  if (education) {
    lines.push('EDUCATION');
    lines.push(`${education.university}${education.location ? ', ' + education.location : ''}`);
    lines.push(`${education.degree} in ${education.major} | ${education.graduation}`);
    if (education.gpa) {
      lines.push(`GPA: ${education.gpa}`);
    }
    if (education.coursework?.length > 0) {
      lines.push(`Relevant Coursework: ${education.coursework.join(', ')}`);
    }
    lines.push('');
  }

  // Experience
  const experience = resume.Experience || resume.experience || [];
  if (experience.length > 0) {
    lines.push('EXPERIENCE');
    for (const exp of experience) {
      lines.push(`${exp.title} | ${exp.company}`);
      if (exp.location || exp.dates) {
        lines.push([exp.location, exp.dates].filter(Boolean).join(' | '));
      }
      for (const bullet of exp.bullets || []) {
        lines.push(`• ${bullet}`);
      }
      lines.push('');
    }
  }

  // Projects
  const projects = resume.Projects || resume.projects || [];
  if (projects.length > 0) {
    lines.push('PROJECTS');
    for (const project of projects) {
      lines.push(project.name);
      lines.push(`• ${project.description}`);
      if (project.technologies?.length > 0) {
        lines.push(`  Technologies: ${project.technologies.join(', ')}`);
      }
      lines.push('');
    }
  }

  // Skills
  const skills = resume.Skills || resume.skills;
  if (skills) {
    lines.push('SKILLS');
    const skillLines = [];
    if (skills.programming_languages?.length > 0) {
      skillLines.push(`Programming: ${skills.programming_languages.join(', ')}`);
    }
    if (skills.tools_frameworks?.length > 0) {
      skillLines.push(`Tools & Frameworks: ${skills.tools_frameworks.join(', ')}`);
    }
    if (skills.core_skills?.length > 0) {
      skillLines.push(`Core Skills: ${skills.core_skills.join(', ')}`);
    }
    if (skills.databases?.length > 0) {
      skillLines.push(`Databases: ${skills.databases.join(', ')}`);
    }
    lines.push(...skillLines);
    lines.push('');
  }

  // Extracurriculars
  const extracurriculars = resume.Extracurriculars || resume.extracurriculars || [];
  if (extracurriculars.length > 0) {
    lines.push('ACTIVITIES & INTERESTS');
    for (const extra of extracurriculars) {
      let line = extra.activity;
      if (extra.role) line += ` - ${extra.role}`;
      if (extra.description) line += `: ${extra.description}`;
      lines.push(`• ${line}`);
    }
  }

  return lines.join('\n');
}

export default ResumeActions;

