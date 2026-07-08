import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Circle,
  Edit3,
  FileText,
  Copy,
  Check,
  ArrowRight,
  Loader2,
  Download,
  FileCheck
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import { BACKEND_URL } from '@/services/api';
import { EnhancedFitAnalysis, RequirementMatch, ResumeEdit, CoverLetter } from '../types/scout';

interface EnhancedFitAnalysisPanelProps {
  analysis: EnhancedFitAnalysis;
  job: {
    title: string;
    company: string;
  };
  onGenerateCoverLetter: () => Promise<void>;
  isGeneratingCoverLetter: boolean;
  userResume?: any;  // Original user resume for generating edited version
}

export const EnhancedFitAnalysisPanel: React.FC<EnhancedFitAnalysisPanelProps> = ({
  analysis,
  job,
  onGenerateCoverLetter,
  isGeneratingCoverLetter,
  userResume
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'requirements' | 'edits' | 'cover_letter'>('overview');
  const [expandedRequirements, setExpandedRequirements] = useState<Set<number>>(new Set());
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [editedResume, setEditedResume] = useState<string | null>(null);
  const [isGeneratingResume, setIsGeneratingResume] = useState(false);
  const [showResumePreview, setShowResumePreview] = useState(false);

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const toggleRequirement = (index: number) => {
    const newExpanded = new Set(expandedRequirements);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRequirements(newExpanded);
  };

  const getMatchIcon = (strength: string) => {
    switch (strength) {
      case 'strong':
        return <CheckCircle2 className="text-green-500" size={16} />;
      case 'partial':
        return <Circle className="text-yellow-500 fill-yellow-200" size={16} />;
      case 'weak':
        return <Circle className="text-orange-400" size={16} />;
      default:
        return <AlertCircle className="text-red-400" size={16} />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  return (
    <div className="bg-white rounded-[3px] border border-gray-200 overflow-hidden">
      {/* Header with Score */}
      <div className="bg-gradient-to-r from-[#FAFBFF] to-[#FAFBFF] p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">
              Fit Analysis: {job.title}
            </h3>
            <p className="text-sm text-gray-600">{job.company}</p>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${
              analysis.score >= 80 ? 'text-green-600' :
              analysis.score >= 60 ? 'text-[#3B82F6]' :
              analysis.score >= 40 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {analysis.score}%
            </div>
            <div className="text-sm text-gray-500 capitalize">
              {analysis.match_level} match
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="flex gap-4 mt-3 text-sm">
          <div className="flex items-center gap-1">
            <CheckCircle2 size={14} className="text-green-500" />
            <span>{analysis.requirements_summary.matched} matched</span>
          </div>
          <div className="flex items-center gap-1">
            <Circle size={14} className="text-yellow-500 fill-yellow-200" />
            <span>{analysis.requirements_summary.partial} partial</span>
          </div>
          <div className="flex items-center gap-1">
            <AlertCircle size={14} className="text-red-400" />
            <span>{analysis.requirements_summary.missing} missing</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'requirements', label: `Requirements (${analysis.job_requirements?.length || 0})` },
          { id: 'edits', label: `Resume Edits (${analysis.resume_edits.length})` },
          { id: 'cover_letter', label: 'Cover Letter' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-[#3B82F6] text-[#3B82F6] bg-[#FAFBFF]'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-[500px] overflow-y-auto">
        
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Pitch */}
            <div className="bg-[#FAFBFF] rounded-[3px] p-3">
              <h4 className="font-medium text-[#0F172A] mb-1">Your Pitch</h4>
              <p className="text-[#0F172A] text-sm">{analysis.pitch}</p>
            </div>

            {/* Strengths */}
            {analysis.strengths.length > 0 && (
              <div>
                <h4 className="font-medium text-green-700 mb-2 flex items-center gap-1">
                  <CheckCircle2 size={16} /> Strengths
                </h4>
                <ul className="space-y-2">
                  {analysis.strengths.map((s, i) => (
                    <li key={i} className="bg-green-50 rounded p-2 text-sm">
                      <span className="font-medium text-green-800">{s.point}</span>
                      {s.evidence && (
                        <span className="text-green-600"> — {s.evidence}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Gaps */}
            {analysis.gaps.length > 0 && (
              <div>
                <h4 className="font-medium text-orange-700 mb-2 flex items-center gap-1">
                  <AlertCircle size={16} /> Gaps to Address
                </h4>
                <ul className="space-y-2">
                  {analysis.gaps.map((g, i) => (
                    <li key={i} className="bg-orange-50 rounded p-2 text-sm">
                      <span className="font-medium text-orange-800">{g.gap}</span>
                      {g.mitigation && (
                        <span className="text-orange-600 block mt-1">
                          → {g.mitigation}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Keywords */}
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Keywords to Use</h4>
              <div className="flex flex-wrap gap-2">
                {analysis.keywords_to_use.map((keyword, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>

            {/* Talking Points */}
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Talking Points</h4>
              <ul className="space-y-1">
                {analysis.talking_points.map((point, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <ArrowRight size={14} className="mt-0.5 text-[#3B82F6] flex-shrink-0" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Requirements Tab */}
        {activeTab === 'requirements' && (
          <div className="space-y-2">
            {analysis.job_requirements && analysis.job_requirements.length > 0 ? (
              analysis.job_requirements.map((req, index) => (
                <div
                  key={index}
                className="border border-gray-200 rounded-[3px] overflow-hidden"
              >
                {/* Requirement Header */}
                <button
                  onClick={() => toggleRequirement(index)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 text-left"
                >
                  {getMatchIcon(req.match_strength)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {req.requirement}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        req.requirement_type === 'required'
                          ? 'bg-red-100 text-red-700'
                          : req.requirement_type === 'preferred'
                          ? 'bg-[rgba(59,130,246,0.10)] text-[#0F172A]'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {req.requirement_type}
                      </span>
                      <span className="text-xs text-gray-500">
                        {req.importance} priority
                      </span>
                    </div>
                  </div>
                  {expandedRequirements.has(index) ? (
                    <ChevronUp size={16} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={16} className="text-gray-400" />
                  )}
                </button>

                {/* Expanded Content */}
                {expandedRequirements.has(index) && (
                  <div className="px-3 pb-3 border-t border-gray-100 bg-gray-50">
                    <p className="text-sm text-gray-600 mt-2 mb-2">
                      {req.explanation}
                    </p>

                    {/* Matching Resume Bullets */}
                    {req.resume_matches.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-gray-500 mb-1">
                          Matching Resume Content:
                        </p>
                        {req.resume_matches.map((match, mi) => (
                          <div
                            key={mi}
                            className="bg-white rounded p-2 mt-1 border border-gray-200 text-sm"
                          >
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                              <span className="font-medium">{match.section}</span>
                              <span>•</span>
                              <span>{match.company_or_context}</span>
                              <span className={`ml-auto px-1.5 py-0.5 rounded ${
                                match.relevance === 'direct'
                                  ? 'bg-green-100 text-green-700'
                                  : match.relevance === 'partial'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {match.relevance}
                              </span>
                            </div>
                            <p className="text-gray-700">{match.bullet}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Suggestion if Missing */}
                    {!req.is_matched && req.suggestion_if_missing && (
                      <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                        <p className="text-xs font-medium text-yellow-800 mb-1">
                          How to address:
                        </p>
                        <p className="text-sm text-yellow-700">
                          {req.suggestion_if_missing}
                        </p>
                      </div>
                    )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No requirements data available</p>
                <p className="text-sm mt-2">Requirements matching may not have completed successfully.</p>
              </div>
            )}
          </div>
        )}

        {/* Resume Edits Tab */}
        {activeTab === 'edits' && (
          <div className="space-y-3">
            {/* Potential Score Improvement */}
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-[3px] p-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-800">
                  Potential score after edits:
                </span>
                <span className="text-xl font-bold text-green-600">
                  {analysis.potential_score_after_edits}%
                  <span className="text-sm font-normal text-green-500 ml-1">
                    (+{analysis.potential_score_after_edits - analysis.score})
                  </span>
                </span>
              </div>
            </div>

            {/* Generate Complete Resume Button */}
            {analysis.resume_edits.length > 0 && (
              <div className="bg-[#FAFBFF] rounded-[3px] p-4 mb-4 border border-[#E2E8F0]">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-[#0F172A] mb-1">
                      Generate Complete Edited Resume
                    </h4>
                    <p className="text-sm text-[#0F172A]">
                      Apply all {analysis.resume_edits.length} edits and get a formatted resume ready to use
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (!userResume) {
                          alert('Resume data not available. Please try analyzing the job again.');
                          return;
                        }
                        
                        setIsGeneratingResume(true);
                        try {
                          
                          const firebaseUser = auth.currentUser;
                          const token = firebaseUser ? await firebaseUser.getIdToken() : null;
                          
                          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                          if (token) {
                            headers['Authorization'] = `Bearer ${token}`;
                          }
                          
                          const response = await fetch(`${BACKEND_URL}/api/scout/generate-edited-resume`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                              user_resume: userResume,
                              resume_edits: analysis.resume_edits,
                              format: 'pdf'
                            }),
                          });
                          
                          const data = await response.json();
                          
                          if (data.status === 'ok' && data.edited_resume) {
                            const pdfBase64 = data.edited_resume.pdf_base64;
                            const formattedText = data.edited_resume.formatted_text;
                            
                            if (pdfBase64) {
                              // Decode and download PDF
                              const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
                              const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              
                              const sanitizeFilename = (str: string) => {
                                return str.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').toLowerCase();
                              };
                              const companyName = sanitizeFilename(job.company || 'company');
                              const jobTitle = sanitizeFilename(job.title || 'position');
                              a.download = `resume-${companyName}-${jobTitle}.pdf`;
                              
                              a.style.display = 'none';
                              document.body.appendChild(a);
                              a.click();
                              
                              setTimeout(() => {
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                              }, 100);
                              
                              // Also set text for preview
                              if (formattedText) {
                                setEditedResume(formattedText);
                                setShowResumePreview(true);
                              }
                            } else {
                              alert('PDF generation failed. Please try again.');
                            }
                          } else {
                            alert(data.message || 'Failed to generate edited resume');
                          }
                        } catch (error) {
                          console.error('[Scout] Failed to generate edited resume:', error);
                          alert('Failed to generate edited resume. Please try again.');
                        } finally {
                          setIsGeneratingResume(false);
                        }
                      }}
                      disabled={isGeneratingResume || !userResume}
                      className="flex items-center gap-2 px-4 py-2 bg-[#0F172A] text-white 
                                 rounded-[3px] hover:bg-[#1E293B] disabled:opacity-50 transition-colors"
                    >
                      {isGeneratingResume ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <FileCheck size={16} />
                          Generate PDF
                        </>
                      )}
                    </button>
                    <button
                      onClick={async () => {
                        if (!userResume) {
                          alert('Resume data not available. Please try analyzing the job again.');
                          return;
                        }
                        
                        setIsGeneratingResume(true);
                        try {
                          
                          const firebaseUser = auth.currentUser;
                          const token = firebaseUser ? await firebaseUser.getIdToken() : null;
                          
                          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                          if (token) {
                            headers['Authorization'] = `Bearer ${token}`;
                          }
                          
                          const response = await fetch(`${BACKEND_URL}/api/scout/generate-edited-resume`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                              user_resume: userResume,
                              resume_edits: analysis.resume_edits,
                              format: 'plain'
                            }),
                          });
                          
                          const data = await response.json();
                          
                          if (data.status === 'ok' && data.edited_resume) {
                            const formattedResume = data.edited_resume.formatted_text;
                            
                            if (!formattedResume || !formattedResume.trim()) {
                              console.error('[Scout] Empty formatted resume received');
                              alert('Generated resume is empty. Please check your resume data.');
                              return;
                            }
                            
                            setEditedResume(formattedResume);
                            setShowResumePreview(true);
                            
                            // Automatically trigger download
                            try {
                              const blob = new Blob([formattedResume], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              
                              const sanitizeFilename = (str: string) => {
                                return str.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').toLowerCase();
                              };
                              const companyName = sanitizeFilename(job.company || 'company');
                              const jobTitle = sanitizeFilename(job.title || 'position');
                              a.download = `resume-${companyName}-${jobTitle}.txt`;
                              
                              a.style.display = 'none';
                              document.body.appendChild(a);
                              a.click();
                              
                              setTimeout(() => {
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);
                              }, 100);
                            } catch (downloadError) {
                              console.error('[Scout] Download failed:', downloadError);
                              alert('Resume generated successfully! The download may have been blocked by your browser. Please use the "Download Again" button or copy the text.');
                            }
                          } else {
                            alert(data.message || 'Failed to generate edited resume');
                          }
                        } catch (error) {
                          console.error('[Scout] Failed to generate edited resume:', error);
                          alert('Failed to generate edited resume. Please try again.');
                        } finally {
                          setIsGeneratingResume(false);
                        }
                      }}
                      disabled={isGeneratingResume || !userResume}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white 
                                 rounded-[3px] hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {isGeneratingResume ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <FileText size={16} />
                          Generate TXT
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Edited Resume Preview */}
            {showResumePreview && editedResume && (
              <div className="bg-white rounded-[3px] border-2 border-[#E2E8F0] p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900">Complete Edited Resume</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        copyToClipboard(editedResume, 'full_resume');
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 
                                 rounded hover:bg-gray-200 transition-colors"
                    >
                      {copiedText === 'full_resume' ? (
                        <>
                          <Check size={14} />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          Copy
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        try {
                          if (!editedResume) {
                            alert('No resume to download');
                            return;
                          }
                          
                          const blob = new Blob([editedResume], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          
                          const sanitizeFilename = (str: string) => {
                            return str.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').toLowerCase();
                          };
                          const companyName = sanitizeFilename(job.company || 'company');
                          const jobTitle = sanitizeFilename(job.title || 'position');
                          a.download = `resume-${companyName}-${jobTitle}.txt`;
                          
                          a.style.display = 'none';
                          document.body.appendChild(a);
                          a.click();
                          
                          setTimeout(() => {
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }, 100);
                        } catch (error) {
                          console.error('[Scout] Download error:', error);
                          alert('Failed to download resume. Please try copying it instead.');
                        }
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-600 text-white 
                                 rounded hover:bg-gray-700 transition-colors"
                    >
                      <Download size={14} />
                      Download TXT
                    </button>
                    <button
                      onClick={async () => {
                        if (!userResume) {
                          alert('Resume data not available');
                          return;
                        }
                        
                        try {
                          
                          const firebaseUser = auth.currentUser;
                          const token = firebaseUser ? await firebaseUser.getIdToken() : null;
                          
                          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                          if (token) {
                            headers['Authorization'] = `Bearer ${token}`;
                          }
                          
                          const response = await fetch(`${BACKEND_URL}/api/scout/generate-edited-resume`, {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                              user_resume: userResume,
                              resume_edits: analysis.resume_edits,
                              format: 'pdf'
                            }),
                          });
                          
                          const data = await response.json();
                          
                          if (data.status === 'ok' && data.edited_resume?.pdf_base64) {
                            const pdfBytes = Uint8Array.from(atob(data.edited_resume.pdf_base64), c => c.charCodeAt(0));
                            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            
                            const sanitizeFilename = (str: string) => {
                              return str.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').toLowerCase();
                            };
                            const companyName = sanitizeFilename(job.company || 'company');
                            const jobTitle = sanitizeFilename(job.title || 'position');
                            a.download = `resume-${companyName}-${jobTitle}.pdf`;
                            
                            a.style.display = 'none';
                            document.body.appendChild(a);
                            a.click();
                            
                            setTimeout(() => {
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            }, 100);
                          } else {
                            alert('Failed to generate PDF');
                          }
                        } catch (error) {
                          console.error('[Scout] PDF download error:', error);
                          alert('Failed to download PDF. Please try again.');
                        }
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-[#0F172A] text-white 
                                 rounded hover:bg-[#1E293B] transition-colors"
                    >
                      <Download size={14} />
                      Download PDF
                    </button>
                  </div>
                </div>
                <div className="bg-gray-50 rounded p-4 border border-gray-200 max-h-96 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                    {editedResume}
                  </pre>
                </div>
              </div>
            )}

            {/* Edit Suggestions */}
            {analysis.resume_edits.map((edit, index) => (
              <div
                key={edit.id}
                className="border border-gray-200 rounded-[3px] overflow-hidden"
              >
                <div className="p-3">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Edit3 size={16} className="text-[#3B82F6]" />
                      <span className="font-medium text-gray-900">
                        {edit.section}
                        {edit.subsection && (
                          <span className="text-gray-500"> • {edit.subsection}</span>
                        )}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded border ${getPriorityColor(edit.priority)}`}>
                      {edit.priority} priority
                    </span>
                  </div>

                  {/* Impact */}
                  <p className="text-sm text-[#3B82F6] mb-2">{edit.impact}</p>

                  {/* Before/After */}
                  {edit.before_after_preview && (
                    <div className="space-y-2 mb-2">
                      {edit.before_after_preview.before && (
                        <div className="bg-red-50 rounded p-2 border border-red-100">
                          <p className="text-xs text-red-500 font-medium mb-1">Before:</p>
                          <p className="text-sm text-red-700 line-through">
                            {edit.before_after_preview.before}
                          </p>
                        </div>
                      )}
                      <div className="bg-green-50 rounded p-2 border border-green-100">
                        <p className="text-xs text-green-600 font-medium mb-1">
                          {edit.current_content ? 'After:' : 'Add:'}
                        </p>
                        <p className="text-sm text-green-800">
                          {edit.before_after_preview.after || edit.suggested_content}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Just Suggested Content if no preview */}
                  {!edit.before_after_preview && (
                    <div className="bg-[#FAFBFF] rounded p-2 border border-[#EEF2F8] mb-2">
                      <p className="text-xs text-[#3B82F6] font-medium mb-1">Suggestion:</p>
                      <p className="text-sm text-[#0F172A]">{edit.suggested_content}</p>
                    </div>
                  )}

                  {/* Rationale */}
                  <p className="text-xs text-gray-500 mb-2">{edit.rationale}</p>

                  {/* Keywords */}
                  {edit.keywords_added.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {edit.keywords_added.map((kw, i) => (
                        <span
                          key={i}
                          className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded"
                        >
                          +{kw}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Copy Button */}
                  <button
                    onClick={() => copyToClipboard(
                      edit.suggested_content,
                      edit.id
                    )}
                    className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                  >
                    {copiedText === edit.id ? (
                      <>
                        <Check size={12} className="text-green-500" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        Copy suggestion
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cover Letter Tab */}
        {activeTab === 'cover_letter' && (
          <div>
            {analysis.cover_letter ? (
              <CoverLetterPanel
                coverLetter={analysis.cover_letter}
                onCopy={(text, id) => copyToClipboard(text, id)}
                copiedText={copiedText}
              />
            ) : (
              <div className="text-center py-8">
                <FileText size={48} className="mx-auto text-gray-300 mb-4" />
                <h4 className="font-medium text-gray-900 mb-2">
                  Generate a Tailored Cover Letter
                </h4>
                <p className="text-sm text-gray-500 mb-4">
                  Based on your fit analysis, we'll create a personalized cover letter
                  that highlights your strengths and addresses key requirements.
                </p>
                <button
                  onClick={onGenerateCoverLetter}
                  disabled={isGeneratingCoverLetter}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F172A] text-white 
                             rounded-[3px] hover:bg-[#1E293B] disabled:opacity-50 transition-colors"
                >
                  {isGeneratingCoverLetter ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>Generate Cover Letter</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Cover Letter Sub-Component
interface CoverLetterPanelProps {
  coverLetter: CoverLetter;
  onCopy: (text: string, id: string) => void;
  copiedText: string | null;
}

const CoverLetterPanel: React.FC<CoverLetterPanelProps> = ({
  coverLetter,
  onCopy,
  copiedText
}) => {
  const [showAlternates, setShowAlternates] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className={`text-xs px-2 py-1 rounded ${
            coverLetter.tone === 'formal'
              ? 'bg-gray-100 text-gray-700'
              : coverLetter.tone === 'enthusiastic'
              ? 'bg-orange-100 text-orange-700'
              : 'bg-[rgba(59,130,246,0.10)] text-[#0F172A]'
          }`}>
            {coverLetter.tone} tone
          </span>
          <span className="text-xs text-gray-500 ml-2">
            {coverLetter.word_count} words
          </span>
        </div>
        <button
          onClick={() => onCopy(coverLetter.full_text, 'full_letter')}
          className="flex items-center gap-1 px-3 py-1.5 bg-[#0F172A] text-white 
                     rounded hover:bg-[#1E293B] text-sm"
        >
          {copiedText === 'full_letter' ? (
            <>
              <Check size={14} />
              Copied!
            </>
          ) : (
            <>
              <Copy size={14} />
              Copy Full Letter
            </>
          )}
        </button>
      </div>

      {/* Customization Summary */}
      <div className="bg-purple-50 rounded-[3px] p-3 text-sm">
        <span className="font-medium text-purple-800">Customization: </span>
        <span className="text-purple-700">{coverLetter.customization_summary}</span>
      </div>

      {/* Full Letter */}
      <div className="bg-gray-50 rounded-[3px] p-4 border border-gray-200">
        <div className="prose prose-sm max-w-none">
          {coverLetter.full_text.split('\n\n').map((paragraph, i) => (
            <p key={i} className="text-gray-800 mb-3 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      {/* What's Addressed */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <h5 className="font-medium text-gray-700 mb-2">Requirements Addressed:</h5>
          <ul className="space-y-1">
            {coverLetter.key_requirements_addressed.map((req, i) => (
              <li key={i} className="flex items-center gap-1 text-gray-600">
                <CheckCircle2 size={12} className="text-green-500" />
                {req}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h5 className="font-medium text-gray-700 mb-2">Resume Points Used:</h5>
          <ul className="space-y-1">
            {coverLetter.key_resume_points_used.map((point, i) => (
              <li key={i} className="flex items-center gap-1 text-gray-600">
                <ArrowRight size={12} className="text-[#3B82F6]" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Alternate Options */}
      <div>
        <button
          onClick={() => setShowAlternates(!showAlternates)}
          className="text-sm text-[#3B82F6] hover:underline flex items-center gap-1"
        >
          {showAlternates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showAlternates ? 'Hide' : 'Show'} alternate openings & closings
        </button>

        {showAlternates && (
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <h5 className="text-xs font-medium text-gray-500 mb-2">
                Alternate Openings:
              </h5>
              {coverLetter.alternate_openings.map((alt, i) => (
                <div
                  key={i}
                  className="bg-white rounded p-2 border border-gray-200 mb-2 text-sm"
                >
                  <p className="text-gray-700">{alt}</p>
                  <button
                    onClick={() => onCopy(alt, `opening_${i}`)}
                    className="text-xs text-gray-400 hover:text-gray-600 mt-1"
                  >
                    {copiedText === `opening_${i}` ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
            <div>
              <h5 className="text-xs font-medium text-gray-500 mb-2">
                Alternate Closings:
              </h5>
              {coverLetter.alternate_closings.map((alt, i) => (
                <div
                  key={i}
                  className="bg-white rounded p-2 border border-gray-200 mb-2 text-sm"
                >
                  <p className="text-gray-700">{alt}</p>
                  <button
                    onClick={() => onCopy(alt, `closing_${i}`)}
                    className="text-xs text-gray-400 hover:text-gray-600 mt-1"
                  >
                    {copiedText === `closing_${i}` ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

