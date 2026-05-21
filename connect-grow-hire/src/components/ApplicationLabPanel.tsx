/**
 * ApplicationLabPanel - Main panel component for Application Lab
 * Displays job fit analysis with 4 tabs: Overview, Requirements, Resume Edits, Cover Letter
 */
import React, { useState, useRef, useEffect } from 'react';
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
  Loader2,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EnhancedFitAnalysis, RequirementMatch, ResumeEdit, CoverLetter } from '@/types/scout';
import { generateEditedResume, generateCoverLetter, JobInput } from '@/services/applicationLab';
import { useToast } from '@/hooks/use-toast';

interface ApplicationLabPanelProps {
  analysis: EnhancedFitAnalysis;
  job: JobInput;
  userResume?: any;
  onCoverLetterGenerated?: (coverLetter: CoverLetter) => void;
}

export const ApplicationLabPanel: React.FC<ApplicationLabPanelProps> = ({
  analysis,
  job,
  userResume,
  onCoverLetterGenerated,
}) => {
  // Gating removed for testing - all features available
  
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'requirements' | 'edits' | 'cover_letter'>('overview');
  const [expandedRequirements, setExpandedRequirements] = useState<Set<number>>(new Set());
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [editedResume, setEditedResume] = useState<string | null>(null);
  const [isGeneratingResume, setIsGeneratingResume] = useState(false);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [coverLetter, setCoverLetter] = useState<CoverLetter | undefined>(analysis.cover_letter);

  // FIX: Store timer ref to prevent memory leak
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // FIX: Clear timer on component unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(id);
    
    // FIX: Clear any existing timer before setting a new one
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    // FIX: Store timer ID in ref
    timerRef.current = setTimeout(() => {
      setCopiedText(null);
      timerRef.current = null;
    }, 2000);
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

  const handleGenerateCoverLetter = async () => {
    if (!userResume) {
      console.error('[ApplicationLab] Resume data not available for cover letter generation');
      toast({
        title: 'Resume Required',
        description: 'Please upload your resume to generate a cover letter.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingCoverLetter(true);
    try {
      const result = await generateCoverLetter(job, userResume, analysis);
      if (result.status === 'ok' && result.cover_letter) {
        setCoverLetter(result.cover_letter);
        if (onCoverLetterGenerated) {
          onCoverLetterGenerated(result.cover_letter);
        }
        toast({
          title: 'Cover Letter Generated',
          description: 'Your personalized cover letter is ready!',
        });
      } else {
        const errorMessage = result.message || 'Failed to generate cover letter';
        console.error('[ApplicationLab] Cover letter generation failed:', errorMessage);
        toast({
          title: 'Generation Failed',
          description: 'We couldn\'t generate your cover letter. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[ApplicationLab] Cover letter generation error:', error);
      toast({
        title: 'Something Went Wrong',
        description: 'An unexpected error occurred. Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  const handleGenerateEditedResume = async (format: 'plain' | 'pdf') => {
    if (!userResume) {
      console.error('[ApplicationLab] Resume data not available for edited resume generation');
      toast({
        title: 'Resume Required',
        description: 'Please upload your resume to generate an edited version.',
        variant: 'destructive',
      });
      return;
    }

    setIsGeneratingResume(true);
    let blobUrl: string | null = null;
    try {
      const result = await generateEditedResume(userResume, analysis.resume_edits, format);
      if (result.status === 'ok' && result.edited_resume) {
        if (format === 'pdf' && result.edited_resume.pdf_base64) {
          const pdfBytes = Uint8Array.from(atob(result.edited_resume.pdf_base64), c => c.charCodeAt(0));
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          const sanitize = (str: string) => str.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').toLowerCase();
          a.download = `resume-${sanitize(job.company || 'company')}-${sanitize(job.title || 'position')}.pdf`;
          a.click();
          URL.revokeObjectURL(blobUrl);
          blobUrl = null;
          if (result.edited_resume.formatted_text) {
            setEditedResume(result.edited_resume.formatted_text);
          }
          toast({
            title: 'Resume Downloaded',
            description: 'Your edited resume has been downloaded as PDF.',
          });
        } else if (result.edited_resume.formatted_text) {
          setEditedResume(result.edited_resume.formatted_text);
          const blob = new Blob([result.edited_resume.formatted_text], { type: 'text/plain' });
          blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          const sanitize = (str: string) => str.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').toLowerCase();
          a.download = `resume-${sanitize(job.company || 'company')}-${sanitize(job.title || 'position')}.txt`;
          a.click();
          URL.revokeObjectURL(blobUrl);
          blobUrl = null;
          toast({
            title: 'Resume Downloaded',
            description: 'Your edited resume has been downloaded as text file.',
          });
        }
      } else {
        const errorMessage = result.message || 'Failed to generate edited resume';
        console.error('[ApplicationLab] Edited resume generation failed:', errorMessage);
        toast({
          title: 'Generation Failed',
          description: 'We couldn\'t generate your edited resume. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('[ApplicationLab] Resume generation error:', error);
      toast({
        title: 'Something Went Wrong',
        description: 'An unexpected error occurred. Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      // Clean up blob URL if it wasn't already revoked
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      setIsGeneratingResume(false);
    }
  };

  // Show all requirements (gating removed for testing)
  const visibleRequirements = analysis.job_requirements;

  return (
    <div className="bg-white rounded-[3px] border border-gray-200 overflow-hidden">
      {/* Header with Score */}
      <div className="bg-[#F8FAFC] p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">
              Application Analysis: {job.title}
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
          { id: 'cover_letter', label: 'Cover Letter' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 px-4 py-2 text-sm font-medium transition-colors relative ${
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
      <div className="p-4 max-h-[600px] overflow-y-auto">
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
                        <span className="text-green-600"> - {s.evidence}</span>
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
              <ul className="space-y-3">
                {analysis.talking_points.map((point, i) => (
                  <li key={i} className="text-sm text-gray-700 border border-gray-200 rounded-[3px] p-3 bg-gray-50">
                    <div className="font-medium text-gray-900 mb-1">{point.topic}</div>
                    <div className="text-gray-600 mb-2">{point.angle}</div>
                    <div className="text-gray-700 mb-2">
                      <span className="font-medium">Example (STAR):</span> {point.example}
                    </div>
                    <div className="text-[#3B82F6] text-xs">
                      <span className="font-medium">Potential question:</span> {point.potential_question}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Potential Score */}
            {analysis.potential_score_after_edits > analysis.score && (
              <div className="bg-green-50 rounded-[3px] p-3 border border-green-200">
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
            )}
          </div>
        )}

        {/* Requirements Tab */}
        {activeTab === 'requirements' && (
          <div className="space-y-2">
            {visibleRequirements && visibleRequirements.length > 0 ? (
              <>
                {visibleRequirements.map((req, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-[3px] overflow-hidden"
                  >
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
                              ? 'bg-[rgba(59,130,246,0.10)] text-[#2563EB]'
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

                    {expandedRequirements.has(index) && (
                      <div className="px-3 pb-3 border-t border-gray-100 bg-gray-50">
                        <p className="text-sm text-gray-600 mt-2 mb-2">
                          {req.explanation}
                        </p>

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
                ))}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No requirements data available</p>
              </div>
            )}
          </div>
        )}

        {/* Resume Edits Tab */}
        {activeTab === 'edits' && (
          <div className="space-y-3">
            <>
                {analysis.potential_score_after_edits > analysis.score && (
                  <div className="bg-green-50 rounded-[3px] p-3 mb-4">
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
                )}

                {/* TODO: PDF generation temporarily disabled - rebuild needed */}
                {false && analysis.resume_edits.length > 0 && (
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
                        <Button
                          onClick={() => handleGenerateEditedResume('pdf')}
                          disabled={isGeneratingResume}
                          className="bg-[#0F172A] hover:bg-[#1E293B]"
                        >
                          {isGeneratingResume ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <>
                              <Download size={16} className="mr-2" />
                              PDF
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => handleGenerateEditedResume('plain')}
                          disabled={isGeneratingResume}
                          variant="outline"
                        >
                          {isGeneratingResume ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <>
                              <FileText size={16} className="mr-2" />
                              TXT
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {analysis.resume_edits.map((edit) => (
                  <div
                    key={edit.id}
                    className="border border-gray-200 rounded-[3px] overflow-hidden"
                  >
                    <div className="p-3">
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

                      <p className="text-sm text-[#3B82F6] mb-2">{edit.impact}</p>

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

                      {!edit.before_after_preview && (
                        <div className="bg-[#FAFBFF] rounded p-2 border border-[#E2E8F0] mb-2">
                          <p className="text-xs text-[#3B82F6] font-medium mb-1">Suggestion:</p>
                          <p className="text-sm text-[#0F172A]">{edit.suggested_content}</p>
                        </div>
                      )}

                      <p className="text-xs text-gray-500 mb-2">{edit.rationale}</p>

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

                      <button
                        onClick={() => copyToClipboard(edit.suggested_content, edit.id)}
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
              </>
          </div>
        )}

        {/* Cover Letter Tab */}
        {activeTab === 'cover_letter' && (
          <div>
            <>
                {coverLetter ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          coverLetter.tone === 'formal'
                            ? 'bg-gray-100 text-gray-700'
                            : coverLetter.tone === 'enthusiastic'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-[rgba(59,130,246,0.10)] text-[#2563EB]'
                        }`}>
                          {coverLetter.tone} tone
                        </span>
                        <span className="text-xs text-gray-500 ml-2">
                          {coverLetter.word_count} words
                        </span>
                      </div>
                      <Button
                        onClick={() => copyToClipboard(coverLetter.full_text, 'full_letter')}
                        size="sm"
                        className="bg-[#0F172A] hover:bg-[#1E293B]"
                      >
                        {copiedText === 'full_letter' ? (
                          <>
                            <Check size={14} className="mr-2" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={14} className="mr-2" />
                            Copy Full Letter
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="bg-purple-50 rounded-[3px] p-3 text-sm">
                      <span className="font-medium text-purple-800">Customization: </span>
                      <span className="text-purple-700">{coverLetter.customization_summary}</span>
                    </div>

                    <div className="bg-gray-50 rounded-[3px] p-4 border border-gray-200">
                      <div className="prose prose-sm max-w-none">
                        {coverLetter.full_text.split('\n\n').map((paragraph, i) => (
                          <p key={i} className="text-gray-800 mb-3 last:mb-0">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
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
                    <Button
                      onClick={handleGenerateCoverLetter}
                      disabled={isGeneratingCoverLetter}
                      className="bg-[#0F172A] hover:bg-[#1E293B]"
                    >
                      {isGeneratingCoverLetter ? (
                        <>
                          <Loader2 size={16} className="animate-spin mr-2" />
                          Generating...
                        </>
                      ) : (
                        <>
                          Generate Cover Letter
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
          </div>
        )}
      </div>
    </div>
  );
};

