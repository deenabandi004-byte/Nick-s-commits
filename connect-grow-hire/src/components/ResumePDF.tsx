import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Link,
} from '@react-pdf/renderer';

// @react-pdf/renderer has built-in Helvetica support - no font registration needed

// Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica', // Built-in font, no registration needed
    fontSize: 10,
    lineHeight: 1.4,
    color: '#333333',
  },
  
  // Header
  header: {
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
    paddingBottom: 12,
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold', // Use string instead of number
    textAlign: 'center',
    color: '#1a1a1a',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  contactItem: {
    fontSize: 9,
    color: '#666666',
  },
  contactSeparator: {
    fontSize: 9,
    color: '#999999',
    marginHorizontal: 6,
  },
  contactLink: {
    fontSize: 9,
    color: '#2563eb',
    textDecoration: 'none',
  },
  
  // Sections
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    paddingBottom: 3,
    marginBottom: 8,
  },
  
  // Summary
  summary: {
    fontSize: 10,
    lineHeight: 1.5,
    color: '#444444',
  },
  
  // Education
  educationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  universityName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  educationLocation: {
    fontSize: 9,
    color: '#666666',
  },
  degree: {
    fontSize: 10,
    color: '#444444',
    marginBottom: 2,
  },
  gpa: {
    fontSize: 9,
    color: '#666666',
    marginBottom: 2,
  },
  coursework: {
    fontSize: 9,
    color: '#555555',
    marginTop: 4,
  },
  courseworkLabel: {
    fontWeight: 'bold',
  },
  
  // Experience
  experienceItem: {
    marginBottom: 10,
  },
  experienceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  jobTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  companyName: {
    fontSize: 10,
    color: '#444444',
  },
  experienceMeta: {
    fontSize: 9,
    color: '#666666',
    textAlign: 'right',
  },
  bulletList: {
    marginTop: 4,
    paddingLeft: 8,
  },
  bulletItem: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  bullet: {
    width: 12,
    fontSize: 10,
    color: '#666666',
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 1.4,
    color: '#444444',
  },
  
  // Projects
  projectItem: {
    marginBottom: 8,
  },
  projectName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  projectDescription: {
    fontSize: 9,
    lineHeight: 1.4,
    color: '#444444',
  },
  projectTech: {
    fontSize: 8,
    color: '#666666',
    marginTop: 2,
    fontStyle: 'italic',
  },
  
  // Skills
  skillsContainer: {
    flexDirection: 'column',
    gap: 4,
  },
  skillRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  skillLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#1a1a1a',
    width: 100,
  },
  skillValue: {
    fontSize: 9,
    color: '#444444',
    flex: 1,
  },
  
  // Extracurriculars
  extraItem: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  extraBullet: {
    width: 12,
    fontSize: 10,
    color: '#666666',
  },
  extraText: {
    flex: 1,
    fontSize: 9,
    color: '#444444',
  },
  extraActivity: {
    fontWeight: 'bold',
  },
});

// Types
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

interface ResumePDFProps {
  resume: ResumeData;
}

// Helper functions
const hasContent = (arr?: any[]) => arr && arr.length > 0;
const hasSkills = (skills?: Skills) => {
  if (!skills) return false;
  return Object.values(skills).some(arr => arr && arr.length > 0);
};

// Component
const ResumePDF: React.FC<ResumePDFProps> = ({ resume }) => {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        
        {/* Header */}
        <View style={styles.header}>
          {resume.name && (
            <Text style={styles.name}>{resume.name}</Text>
          )}
          {resume.contact && (
            <View style={styles.contactRow}>
              {resume.contact.location && (
                <>
                  <Text style={styles.contactItem}>{resume.contact.location}</Text>
                  <Text style={styles.contactSeparator}>|</Text>
                </>
              )}
              {resume.contact.email && (
                <>
                  <Link src={`mailto:${resume.contact.email}`} style={styles.contactLink}>
                    {resume.contact.email}
                  </Link>
                  <Text style={styles.contactSeparator}>|</Text>
                </>
              )}
              {resume.contact.phone && (
                <Text style={styles.contactItem}>{resume.contact.phone}</Text>
              )}
              {resume.contact.linkedin && (
                <>
                  <Text style={styles.contactSeparator}>|</Text>
                  <Link src={resume.contact.linkedin} style={styles.contactLink}>
                    LinkedIn
                  </Link>
                </>
              )}
              {resume.contact.github && (
                <>
                  <Text style={styles.contactSeparator}>|</Text>
                  <Link src={resume.contact.github} style={styles.contactLink}>
                    GitHub
                  </Link>
                </>
              )}
            </View>
          )}
        </View>

        {/* Summary */}
        {resume.Summary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text style={styles.summary}>{resume.Summary}</Text>
          </View>
        )}

        {/* Education */}
        {resume.Education && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            <View style={styles.educationHeader}>
              <Text style={styles.universityName}>{resume.Education.university}</Text>
              <Text style={styles.educationLocation}>
                {[resume.Education.location, resume.Education.graduation].filter(Boolean).join(' | ')}
              </Text>
            </View>
            <Text style={styles.degree}>
              {resume.Education.degree} in {resume.Education.major}
            </Text>
            {resume.Education.gpa && (
              <Text style={styles.gpa}>GPA: {resume.Education.gpa}</Text>
            )}
            {hasContent(resume.Education.honors) && (
              <Text style={styles.gpa}>Honors: {resume.Education.honors!.join(', ')}</Text>
            )}
            {hasContent(resume.Education.coursework) && (
              <Text style={styles.coursework}>
                <Text style={styles.courseworkLabel}>Relevant Coursework: </Text>
                {resume.Education.coursework!.join(', ')}
              </Text>
            )}
          </View>
        )}

        {/* Experience */}
        {hasContent(resume.Experience) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>
            {resume.Experience!.map((exp, index) => (
              <View key={index} style={styles.experienceItem}>
                <View style={styles.experienceHeader}>
                  <View>
                    <Text style={styles.jobTitle}>{exp.title}</Text>
                    <Text style={styles.companyName}>{exp.company}</Text>
                  </View>
                  <View>
                    <Text style={styles.experienceMeta}>
                      {[exp.location, exp.dates].filter(Boolean).join(' | ')}
                    </Text>
                  </View>
                </View>
                {hasContent(exp.bullets) && (
                  <View style={styles.bulletList}>
                    {exp.bullets.map((bullet, bulletIndex) => (
                      <View key={bulletIndex} style={styles.bulletItem}>
                        <Text style={styles.bullet}>•</Text>
                        <Text style={styles.bulletText}>{bullet}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Projects */}
        {hasContent(resume.Projects) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Projects</Text>
            {resume.Projects!.map((project, index) => (
              <View key={index} style={styles.projectItem}>
                <Text style={styles.projectName}>{project.name}</Text>
                <Text style={styles.projectDescription}>{project.description}</Text>
                {hasContent(project.technologies) && (
                  <Text style={styles.projectTech}>
                    Technologies: {project.technologies!.join(', ')}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Skills */}
        {hasSkills(resume.Skills) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <View style={styles.skillsContainer}>
              {hasContent(resume.Skills!.programming_languages) && (
                <View style={styles.skillRow}>
                  <Text style={styles.skillLabel}>Programming:</Text>
                  <Text style={styles.skillValue}>
                    {resume.Skills!.programming_languages!.join(', ')}
                  </Text>
                </View>
              )}
              {hasContent(resume.Skills!.tools_frameworks) && (
                <View style={styles.skillRow}>
                  <Text style={styles.skillLabel}>Tools & Frameworks:</Text>
                  <Text style={styles.skillValue}>
                    {resume.Skills!.tools_frameworks!.join(', ')}
                  </Text>
                </View>
              )}
              {hasContent(resume.Skills!.databases) && (
                <View style={styles.skillRow}>
                  <Text style={styles.skillLabel}>Databases:</Text>
                  <Text style={styles.skillValue}>
                    {resume.Skills!.databases!.join(', ')}
                  </Text>
                </View>
              )}
              {hasContent(resume.Skills!.cloud_devops) && (
                <View style={styles.skillRow}>
                  <Text style={styles.skillLabel}>Cloud & DevOps:</Text>
                  <Text style={styles.skillValue}>
                    {resume.Skills!.cloud_devops!.join(', ')}
                  </Text>
                </View>
              )}
              {hasContent(resume.Skills!.core_skills) && (
                <View style={styles.skillRow}>
                  <Text style={styles.skillLabel}>Core Skills:</Text>
                  <Text style={styles.skillValue}>
                    {resume.Skills!.core_skills!.join(', ')}
                  </Text>
                </View>
              )}
              {hasContent(resume.Skills!.languages) && (
                <View style={styles.skillRow}>
                  <Text style={styles.skillLabel}>Languages:</Text>
                  <Text style={styles.skillValue}>
                    {resume.Skills!.languages!.join(', ')}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Extracurriculars - ONLY if has content */}
        {hasContent(resume.Extracurriculars) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activities & Interests</Text>
            {resume.Extracurriculars!.map((extra, index) => (
              <View key={index} style={styles.extraItem}>
                <Text style={styles.extraBullet}>•</Text>
                <Text style={styles.extraText}>
                  <Text style={styles.extraActivity}>{extra.activity}</Text>
                  {extra.role && ` — ${extra.role}`}
                  {extra.description && `: ${extra.description}`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* NO "None" sections - we simply don't render empty sections */}

      </Page>
    </Document>
  );
};

export default ResumePDF;
