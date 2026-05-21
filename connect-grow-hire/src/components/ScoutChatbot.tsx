import React, { useState, useRef, useEffect } from 'react';
import { Send, ExternalLink, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingBar, InlineLoadingBar } from '@/components/ui/LoadingBar';
import { auth } from '@/lib/firebase';
import { BACKEND_URL } from '@/services/api';

interface SearchFields {
  job_title?: string;
  company?: string;
  location?: string;
  experience_level?: string;
}

interface JobListing {
  title: string;
  company: string;
  location?: string;
  url?: string;
  snippet?: string;
}

interface JobFitAnalysis {
  overall_score?: number;
  strengths?: string[];
  gaps?: string[];
  angles?: string[];
  experience_match?: string;
}

interface DetailedJobFitAnalysis {
  score: number;
  match_level: 'strong' | 'good' | 'moderate' | 'stretch';
  strengths: Array<{ point: string; evidence: string }>;
  gaps: Array<{ gap: string; mitigation: string }>;
  pitch: string;
  talking_points: string[];
  keywords_to_use: string[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fields?: SearchFields;
  jobListings?: JobListing[];
  fitAnalysis?: JobFitAnalysis;
  timestamp: Date;
}

interface UserResume {
  skills?: string[];
  experience?: Array<{
    title: string;
    company: string;
    duration?: string;
    description?: string;
  }>;
  education?: Array<{
    school: string;
    degree: string;
    field?: string;
    year?: string;
  }>;
  summary?: string;
  rawText?: string;
  // Also support parsed format from Firestore
  name?: string;
  university?: string;
  major?: string;
  year?: string;
  location?: string; // Location extracted from resume
  key_experiences?: string[];
  achievements?: string[];
  interests?: string[];
  // Support nested resumeParsed structure from Firestore
  resumeParsed?: {
    name?: string;
    university?: string;
    major?: string;
    year?: string;
    location?: string;
    key_experiences?: string[];
    skills?: string[];
    achievements?: string[];
    interests?: string[];
  };
}

interface ScoutChatbotProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
  userResume?: UserResume;
}

/**
 * Simplifies complex job titles for better contact search results.
 * e.g., "Treasury & Capital Markets Senior Analyst" → "Senior Analyst"
 * e.g., "Software Development Engineer II" → "Software Engineer"
 */
const simplifyJobTitle = (title: string): string => {
  if (!title) return title;
  
  // Core role types to look for (order matters - more specific first)
  const coreRoles = [
    'Software Engineer', 'Software Developer', 'Engineer',
    'Product Manager', 'Program Manager', 'Project Manager',
    'Data Scientist', 'Data Analyst', 'Data Engineer',
    'Investment Banking Analyst', 'Investment Banker',
    'Financial Analyst', 'Business Analyst', 'Analyst',
    'Consultant', 'Associate', 'Manager', 'Director',
    'Designer', 'Researcher', 'Scientist',
    'Account Executive', 'Sales Representative',
    'Marketing Manager', 'Marketing Specialist',
    'Operations Manager', 'Operations Analyst',
    'HR Manager', 'Recruiter', 'Talent Acquisition',
    'Attorney', 'Lawyer', 'Counsel',
    'Accountant', 'Controller', 'Auditor',
  ];
  
  // Seniority levels to preserve
  const seniorityLevels = ['Senior', 'Staff', 'Principal', 'Lead', 'Junior', 'Associate', 'Vice President', 'VP'];
  
  const titleLower = title.toLowerCase();
  
  // Find the core role in the title
  let matchedRole = '';
  for (const role of coreRoles) {
    if (titleLower.includes(role.toLowerCase())) {
      matchedRole = role;
      break;
    }
  }
  
  // If no core role found, return original (but maybe shortened)
  if (!matchedRole) {
    // If title is very long (>40 chars), try to extract last meaningful part
    if (title.length > 40) {
      const parts = title.split(/[-– - ,&]/);
      const lastPart = parts[parts.length - 1].trim();
      if (lastPart.length > 3) {
        return lastPart;
      }
    }
    return title;
  }
  
  // Check if there's a seniority level before the role
  let seniority = '';
  for (const level of seniorityLevels) {
    if (titleLower.includes(level.toLowerCase())) {
      seniority = level;
      break;
    }
  }
  
  // Build simplified title
  if (seniority && !matchedRole.toLowerCase().includes(seniority.toLowerCase())) {
    return `${seniority} ${matchedRole}`;
  }
  
  return matchedRole;
};

const ScoutChatbot: React.FC<ScoutChatbotProps> = ({ onJobTitleSuggestion, userResume }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<Record<string, any>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [analyzingJobId, setAnalyzingJobId] = useState<string | null>(null);
  const [jobAnalyses, setJobAnalyses] = useState<Record<string, DetailedJobFitAnalysis>>({});
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // No initial greeting message - using static bubble instead

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${BACKEND_URL}/api/scout/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMessage.content,
          context,
        }),
      });

      const data = await response.json();

      // Update context for next message
      if (data.context) {
        setContext(data.context);
      }

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        fields: data.fields,
        jobListings: data.job_listings,
        fitAnalysis: data.fit_analysis,
        timestamp: new Date(),
      };

      // Debug: Log job listings to check if URLs are present
      if (data.job_listings && data.job_listings.length > 0) {
        console.log('[Scout] Job listings received:', data.job_listings.map((j: JobListing) => ({
          title: j.title,
          company: j.company,
          url: j.url,
          hasUrl: !!j.url
        })));
      }

      setMessages(prev => [...prev, assistantMessage]);

      // Auto-populate fields if returned
      if (data.fields) {
        const { job_title, company, location } = data.fields;
        if ((job_title || company || location) && onJobTitleSuggestion) {
          onJobTitleSuggestion(
            job_title || '',
            company || undefined,
            location || undefined
          );
        }
      }

    } catch (error) {
      console.error('[Scout] Error:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "Oops! I ran into an issue. Please try again or rephrase your message.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleJobClick = (job: JobListing) => {
    if (onJobTitleSuggestion) {
      // Simplify job title for better contact search results
      const simplifiedTitle = simplifyJobTitle(job.title);
      console.log('[Scout] Simplified job title:', job.title, '→', simplifiedTitle);
      onJobTitleSuggestion(simplifiedTitle, job.company, job.location || undefined);
    }
  };

  const analyzeJob = async (job: JobListing, jobId: string) => {
    console.log('[Scout] analyzeJob called', { jobId, job, hasResume: !!userResume });
    
    // Don't re-analyze if we already have it
    if (jobAnalyses[jobId]) {
      console.log('[Scout] Analysis already exists, toggling expand');
      setExpandedJobId(expandedJobId === jobId ? null : jobId);
      return;
    }
    
    if (!userResume) {
      console.warn('[Scout] Cannot analyze job without resume');
      alert('Please upload your resume in Account Settings to use job fit analysis.');
      return;
    }
    
    setAnalyzingJobId(jobId);
    console.log('[Scout] Starting analysis for job:', job.title);
    
    try {
      const analysisToken = await auth.currentUser?.getIdToken();
      const response = await fetch(`${BACKEND_URL}/api/scout/analyze-job`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(analysisToken ? { 'Authorization': `Bearer ${analysisToken}` } : {}),
        },
        body: JSON.stringify({ job }),
      });
      
      console.log('[Scout] Analysis response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Scout] Analysis failed with status:', response.status, errorText);
        throw new Error(`Analysis failed: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log('[Scout] Analysis response:', data);
      console.log('[Scout] Response status:', data.status);
      console.log('[Scout] Has analysis:', !!data.analysis);
      console.log('[Scout] Analysis keys:', data.analysis ? Object.keys(data.analysis) : 'N/A');
      
      if (data.status === 'ok' && data.analysis) {
        // Validate and normalize analysis data
        const analysis = { ...data.analysis };
        
        // Fill in defaults for missing fields
        if (typeof analysis.score !== 'number') analysis.score = 50;
        if (!analysis.match_level) analysis.match_level = 'moderate';
        if (!analysis.pitch) analysis.pitch = '';
        if (!Array.isArray(analysis.talking_points)) analysis.talking_points = [];
        if (!Array.isArray(analysis.keywords_to_use)) analysis.keywords_to_use = [];
        
        // Normalize strengths to array of objects
        if (!Array.isArray(analysis.strengths)) {
          analysis.strengths = [];
        } else {
          analysis.strengths = analysis.strengths.map((s: any) => {
            if (typeof s === 'string') {
              return { point: s, evidence: '' };
            } else if (typeof s === 'object' && s !== null) {
              return {
                point: s.point || s.strength || String(s),
                evidence: s.evidence || s.proof || ''
              };
            }
            return { point: String(s), evidence: '' };
          });
        }
        
        // Normalize gaps to array of objects
        if (!Array.isArray(analysis.gaps)) {
          analysis.gaps = [];
        } else {
          analysis.gaps = analysis.gaps.map((g: any) => {
            if (typeof g === 'string') {
              return { gap: g, mitigation: '' };
            } else if (typeof g === 'object' && g !== null) {
              return {
                gap: g.gap || g.weakness || String(g),
                mitigation: g.mitigation || g.solution || ''
              };
            }
            return { gap: String(g), mitigation: '' };
          });
        }
        
        console.log('[Scout] Normalized analysis:', analysis);
        
        setJobAnalyses(prev => ({
          ...prev,
          [jobId]: analysis,
        }));
        setExpandedJobId(jobId);
        console.log('[Scout] Analysis saved and expanded');
      } else {
        console.error('[Scout] Analysis response missing data:', data);
        const errorMsg = data.message || 'Unknown error';
        alert(`Failed to analyze job fit: ${errorMsg}`);
      }
    } catch (error) {
      console.error('[Scout] Analysis failed:', error);
      alert('Failed to analyze job fit. Please try again.');
    } finally {
      setAnalyzingJobId(null);
    }
  };

  const formatMessage = (content: string) => {
    // Convert markdown-like formatting to HTML
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br />');
  };

  const handleQuickAction = async (action: string) => {
    if (action === 'paste-url') {
      setInput('Paste job URL here...');
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (action === 'find-jobs-resume') {
      // Auto-send message to trigger resume-based job search
      const message = 'Find jobs that fit my resume';
      setInput(message);
      
      // Create and send the message directly
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);

      try {
        const retryToken = await auth.currentUser?.getIdToken();
        const response = await fetch(`${BACKEND_URL}/api/scout/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(retryToken ? { 'Authorization': `Bearer ${retryToken}` } : {}),
          },
          body: JSON.stringify({
            message: message,
            context,
          }),
        });

        const data = await response.json();

        // Update context for next message
        if (data.context) {
          setContext(data.context);
        }

        // Create assistant message
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.message,
          fields: data.fields,
          jobListings: data.job_listings,
          fitAnalysis: data.fit_analysis,
          timestamp: new Date(),
        };

        // Debug: Log job listings to check if URLs are present
        if (data.job_listings && data.job_listings.length > 0) {
          console.log('[Scout] Job listings received:', data.job_listings.map((j: JobListing) => ({
            title: j.title,
            company: j.company,
            url: j.url,
            hasUrl: !!j.url
          })));
        }

        setMessages(prev => [...prev, assistantMessage]);

        // Auto-populate fields if returned
        if (data.fields) {
          const { job_title, company, location } = data.fields;
          if ((job_title || company || location) && onJobTitleSuggestion) {
            onJobTitleSuggestion(
              job_title || '',
              company || undefined,
              location || undefined
            );
          }
        }

      } catch (error) {
        console.error('[Scout] Error:', error);
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: "Oops! I ran into an issue. Please try again or rephrase your message.",
          timestamp: new Date(),
        }]);
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    } else if (action === 'ask-company') {
      setInput('Ask about a company...');
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Static Scout Message Bubble */}
        {messages.length === 0 && (
          <div className="mt-3 mx-4 p-3 rounded-2xl bg-[#F5F7FF]">
            <p className="text-sm text-slate-800">
              Hey! I'm Scout. Paste a job posting URL or describe a role and I'll fill in your search filters for you.
            </p>
          </div>
        )}

        {/* Quick Action Chips */}
        {messages.length === 0 && (
          <div className="mt-3 flex flex-wrap gap-2 px-4">
            <button
              onClick={() => handleQuickAction('paste-url')}
              className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Paste job URL
            </button>
            <button
              onClick={() => handleQuickAction('find-jobs-resume')}
              className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Find jobs that fit my resume
            </button>
            <button
              onClick={() => handleQuickAction('ask-company')}
              className="inline-flex items-center px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
            >
              Ask about a company
            </button>
          </div>
        )}

        {/* Chat Messages */}
        <div className="px-4 py-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
                className={`max-w-[85%] rounded-2xl p-3 ${
                  message.role === 'user'
                    ? 'text-white'
                    : 'bg-[#F5F7FF] text-slate-800'
                }`}
                style={message.role === 'user' ? { background: 'linear-gradient(135deg, #0F172A, #1E293B)' } : undefined}
              >
                {/* Message content */}
                <div
                  className="text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                />

                {/* Fields badge */}
                {message.fields && Object.keys(message.fields).length > 0 && (
                  <div className="mt-3 p-2 bg-[#FAFBFF] border border-[#E2E8F0] rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1 text-[#0F172A] text-xs font-medium">
                        <Bot className="h-3 w-3" />
                        Search fields updated!
                      </div>
                      <div className="text-xs text-[#3B82F6] bg-[rgba(59,130,246,0.10)] px-2 py-0.5 rounded" title="Fields optimized for better search results">
                        ✨ Optimized
                      </div>
                    </div>
                    <div className="text-xs text-[#3B82F6] space-y-0.5">
                      {message.fields.job_title && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Title:</span>
                          <span>{message.fields.job_title}</span>
                        </div>
                      )}
                      {message.fields.company && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Company:</span>
                          <span>{message.fields.company}</span>
                        </div>
                      )}
                      {message.fields.location && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Location:</span>
                          <span>{message.fields.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Fit Analysis */}
                {message.fitAnalysis && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="text-xs font-semibold text-amber-900 mb-2">🎯 Job Fit Analysis</div>
                    {message.fitAnalysis.strengths && message.fitAnalysis.strengths.length > 0 && (
                      <div className="mb-2">
                        {message.fitAnalysis.strengths.map((strength, idx) => (
                          <div key={idx} className="text-xs text-amber-800 mb-1">
                            ✅ {strength}
                          </div>
                        ))}
                      </div>
                    )}
                    {message.fitAnalysis.gaps && message.fitAnalysis.gaps.length > 0 && (
                      <div className="mb-2">
                        {message.fitAnalysis.gaps.map((gap, idx) => (
                          <div key={idx} className="text-xs text-amber-700 mb-1">
                            ⚠️ {gap}
                          </div>
                        ))}
                      </div>
                    )}
                    {message.fitAnalysis.angles && message.fitAnalysis.angles.length > 0 && (
                      <div className="text-xs text-amber-800 font-medium mt-2">
                        💡 <strong>Angle:</strong> {message.fitAnalysis.angles[0]}
                      </div>
                    )}
                    {message.fitAnalysis.overall_score !== undefined && (
                      <div className="text-xs text-amber-900 font-medium mt-2">
                        Overall Fit: {message.fitAnalysis.overall_score}/100
                      </div>
                    )}
                  </div>
                )}

                {/* Job listings */}
                {message.jobListings && message.jobListings.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-slate-600 font-medium">Click to use for search:</div>
                    {message.jobListings.slice(0, 5).map((job, idx) => {
                      const jobId = `${message.id}-job-${idx}`;
                      const analysis = jobAnalyses[jobId];
                      const isExpanded = expandedJobId === jobId;
                      const isAnalyzing = analyzingJobId === jobId;
                      
                      return (
                        <div
                          key={idx}
                          className="bg-white rounded-lg border border-slate-200 overflow-hidden"
                        >
                          {/* Job Header - Always visible */}
                          <div className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div
                                onClick={() => handleJobClick(job)}
                                className="flex-1 text-left min-w-0 cursor-pointer"
                              >
                                <div className="text-sm font-medium text-slate-900">{job.title}</div>
                                <div className="text-xs text-slate-500">
                                  {job.company}
                                  {job.location && ` • ${job.location}`}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                {/* Analyze Fit Button */}
                                {userResume ? (
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      console.log('[Scout] Analyze Fit button clicked', { jobId, job });
                                      analyzeJob(job, jobId);
                                    }}
                                    disabled={isAnalyzing}
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-all whitespace-nowrap cursor-pointer ${
                                      analysis
                                        ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    } ${isAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  >
                                    {isAnalyzing ? (
                                      <div className="inline-flex items-center gap-1.5">
                                        <div className="w-8 h-0.5 bg-[rgba(59,130,246,0.10)] rounded-full overflow-hidden">
                                          <div className="h-full w-full bg-gradient-to-r from-[#3B82F6] via-[#2563EB] to-[#3B82F6] bg-[length:200%_100%] animate-loading-shimmer" />
                                        </div>
                                        <span className="text-xs">Analyzing...</span>
                                      </div>
                                    ) : analysis ? (
                                      `${analysis.score}% Match`
                                    ) : (
                                      'Analyze Fit'
                                    )}
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-400">Upload resume to analyze</span>
                                )}
                                
                                {/* View Job Button */}
                                {job.url && job.url.trim() && job.url.startsWith('http') ? (
                                  <a
                                    href={job.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-white rounded transition-all shadow-sm hover:shadow-md hover:opacity-90 flex items-center gap-1.5 whitespace-nowrap"
                                    style={{ background: 'linear-gradient(135deg, #0F172A, #1E293B)' }}
                                    title="View job posting"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      console.log('[Scout] Opening job URL:', job.url);
                                    }}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    <span>View</span>
                                  </a>
                                ) : (
                                  <button
                                    disabled
                                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-400 rounded cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
                                    title="Job URL not available"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    <span>View</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Expanded Analysis Panel */}
                          {isExpanded && analysis && (
                            <div className="border-t border-slate-100 bg-slate-50 p-4">
                              {/* Score Header */}
                              <div className="flex items-center gap-3 mb-4">
                                <div className={`text-2xl font-bold ${
                                  analysis.score >= 70 ? 'text-green-600' :
                                  analysis.score >= 50 ? 'text-yellow-600' : 'text-orange-600'
                                }`}>
                                  {analysis.score}%
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-slate-900">
                                    {analysis.match_level === 'strong' && '🎯 Strong Match'}
                                    {analysis.match_level === 'good' && '👍 Good Match'}
                                    {analysis.match_level === 'moderate' && '🤔 Moderate Match'}
                                    {analysis.match_level === 'stretch' && '🌱 Stretch Role'}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    Based on your resume
                                  </div>
                                </div>
                              </div>
                              
                              {/* Strengths */}
                              {analysis.strengths && analysis.strengths.length > 0 && (
                                <div className="mb-4">
                                  <div className="text-xs font-medium text-slate-700 mb-2">
                                    What aligns:
                                  </div>
                                  <div className="space-y-2">
                                    {analysis.strengths.map((s, i) => (
                                      <div key={i} className="flex gap-2">
                                        <span className="text-green-500 mt-0.5">✓</span>
                                        <div>
                                          <span className="text-sm text-slate-800">{s.point}</span>
                                          <span className="text-xs text-slate-500 ml-1"> - {s.evidence}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {/* Gaps */}
                              {analysis.gaps && analysis.gaps.length > 0 && (
                                <div className="mb-4">
                                  <div className="text-xs font-medium text-slate-700 mb-2">
                                    Gaps to address:
                                  </div>
                                  <div className="space-y-2">
                                    {analysis.gaps.map((g, i) => (
                                      <div key={i} className="flex gap-2">
                                        <span className="text-orange-500 mt-0.5">!</span>
                                        <div>
                                          <span className="text-sm text-slate-800">{g.gap}</span>
                                          <div className="text-xs text-slate-600 mt-0.5">
                                            💡 {g.mitigation}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {/* Pitch */}
                              {analysis.pitch && (
                                <div className="mb-4 p-3 bg-[#FAFBFF] rounded-lg border border-[#E2E8F0]">
                                  <div className="text-xs font-medium text-[#0F172A] mb-1">
                                    💬 How to pitch yourself:
                                  </div>
                                  <div className="text-sm text-[#0F172A] italic">
                                    "{analysis.pitch}"
                                  </div>
                                </div>
                              )}
                              
                              {/* Talking Points */}
                              {analysis.talking_points && analysis.talking_points.length > 0 && (
                                <div className="mb-4">
                                  <div className="text-xs font-medium text-slate-700 mb-2">
                                    Talking points for outreach:
                                  </div>
                                  <ul className="space-y-1">
                                    {analysis.talking_points.map((point, i) => (
                                      <li key={i} className="text-sm text-slate-700 flex gap-2">
                                        <span className="text-slate-400">•</span>
                                        <span>{point}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {/* Keywords */}
                              {analysis.keywords_to_use && analysis.keywords_to_use.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-4">
                                  {analysis.keywords_to_use.map((kw, i) => (
                                    <span
                                      key={i}
                                      className="px-2 py-0.5 bg-slate-200 text-slate-700 text-xs rounded"
                                    >
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              )}
                              
                              {/* Actions */}
                              <div className="flex gap-2 mt-4 pt-3 border-t border-slate-200">
                                <button
                                  onClick={() => {
                                    // Store fit context for email generation
                                    if (analysis) {
                                      const fitContext = {
                                        job_title: job.title,
                                        company: job.company,
                                        score: analysis.score,
                                        match_level: analysis.match_level,
                                        pitch: analysis.pitch,
                                        talking_points: analysis.talking_points,
                                        strengths: analysis.strengths,
                                        gaps: analysis.gaps,
                                        keywords: analysis.keywords_to_use,
                                      };
                                      localStorage.setItem('scout_fit_context', JSON.stringify(fitContext));
                                      console.log('[Scout] Stored fit context for email generation:', fitContext);
                                    }
                                    handleJobClick(job);
                                  }}
                                  className="flex-1 py-2 text-sm font-medium text-white rounded"
                                  style={{ background: 'linear-gradient(135deg, #0F172A, #1E293B)' }}
                                >
                                  Find Contacts in This Role
                                </button>
                                <button
                                  onClick={() => setExpandedJobId(null)}
                                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded"
                                >
                                  Collapse
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        ))}
        
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />

          {/* Loading indicator */}
          {isLoading && (
          <div className="flex justify-start">
              <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 w-full max-w-md">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-slate-600">
                    <span className="text-sm font-medium">Scout is thinking...</span>
                  </div>
                  <LoadingBar variant="indeterminate" size="sm" />
                </div>
            </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="px-4 py-3 border-t border-[#E2E8F0] bg-white">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Paste a job URL or describe what you're looking for..."
            className="flex-1 bg-white border-[#E2E8F0] text-slate-900 placeholder:text-slate-400 focus:border-[#3B82F6] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/20 rounded-md"
            disabled={isLoading}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="relative overflow-hidden hover:opacity-90 rounded-md"
            style={{ background: 'linear-gradient(135deg, #0F172A, #1E293B)' }}
          >
            <Send className="h-4 w-4" />
            <InlineLoadingBar isLoading={isLoading} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ScoutChatbot;
