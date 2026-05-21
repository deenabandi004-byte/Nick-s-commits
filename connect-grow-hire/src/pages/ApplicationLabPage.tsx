/**
 * ApplicationLabPage - Full-page workspace for application analysis
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppHeader } from '@/components/AppHeader';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { ApplicationLabPanel } from '@/components/ApplicationLabPanel';
import { analyzeApplication, getAnalysis, repairResume, JobInput } from '@/services/applicationLab';
import { EnhancedFitAnalysis, CoverLetter } from '@/types/scout';

export default function ApplicationLabPage() {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [jobInput, setJobInput] = useState<string>('');
  const [job, setJob] = useState<JobInput | null>(null);
  const [userResume, setUserResume] = useState<any>(null);
  const [analysis, setAnalysis] = useState<EnhancedFitAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(searchParams.get('analysisId') || null);
  
  // Paste fallback UI state
  const [showPasteFallback, setShowPasteFallback] = useState(false);
  const [pastedDescription, setPastedDescription] = useState<string>('');
  const [originalJobUrl, setOriginalJobUrl] = useState<string | null>(null);
  
  // Repair resume state
  const [isRepairing, setIsRepairing] = useState(false);

  // Load resume on mount
  useEffect(() => {
    const loadResume = async () => {
      try {
        const { db } = await import('@/lib/firebase');
        const { doc, getDoc } = await import('firebase/firestore');
        
        if (!user?.uid) return;
        
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const resumeText = userData.resumeText || userData.resume_text || '';
          const resumeData = {
            resumeText: resumeText,
            rawText: resumeText,
            resumeParsed: userData.resumeParsed || {},
            resumeUrl: userData.resumeUrl || null,
            resumeFileName: userData.resumeFileName || null,
            resumeNeedsOCR: userData.resumeNeedsOCR || false,
            ...userData.resumeParsed,
          };
          setUserResume(resumeData);
          
          // Show warning if resumeText missing but resumeUrl exists
          if (!resumeText && resumeData.resumeUrl) {
            console.warn('[ApplicationLab] Resume text missing but resumeUrl exists - user may need to repair');
          }
        }
      } catch (err) {
        console.error('Failed to load resume:', err);
      }
    };
    
    loadResume();
  }, [user]);

  // Load analysis if analysisId is provided
  useEffect(() => {
    const loadAnalysis = async () => {
      if (!analysisId || !user?.uid) return;
      
      setIsLoading(true);
      setError(null);
      
      try {
        const result = await getAnalysis(analysisId);
        if (result.status === 'ok' && result.analysis && result.job_snapshot) {
          setAnalysis(result.analysis);
          setJob(result.job_snapshot);
        } else {
          setError(result.message || 'Failed to load analysis');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analysis');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadAnalysis();
  }, [analysisId, user]);

  const handleAnalyze = async () => {
    if (!jobInput.trim()) {
      setError('Please enter a job URL or description');
      return;
    }

    if (!userResume) {
      setError('Please upload your resume in Account Settings first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Try to parse job URL or use as manual input
      let jobData: JobInput;
      
      if (jobInput.startsWith('http://') || jobInput.startsWith('https://')) {
        // URL input - pass the URL and let backend extract job details
        // The backend will fetch and parse the job posting
        jobData = {
          url: jobInput,
          title: '', // Will be extracted by backend
          company: '', // Will be extracted by backend
          snippet: '', // Will be fetched by backend
        };
      } else {
        // Manual input - expect format: "Title at Company" or similar
        const parts = jobInput.split(' at ');
        jobData = {
          title: parts[0] || jobInput,
          company: parts[1] || '',
          snippet: '',
        };
      }

      const result = await analyzeApplication(jobData, userResume);
      
      if (result.status === 'ok' && result.analysis) {
        // Success - hide paste fallback if it was showing
        setShowPasteFallback(false);
        setPastedDescription('');
        setAnalysis(result.analysis);
        setJob(jobData);
        if (result.analysis_id) {
          setAnalysisId(result.analysis_id);
          // Update URL without navigation
          window.history.replaceState({}, '', `/application-lab?analysisId=${result.analysis_id}`);
        }
      } else {
        // Check if this is the JOB_DESCRIPTION_EMPTY error
        const isJobDescriptionEmpty = 
          result.error_code === 'JOB_DESCRIPTION_EMPTY' ||
          result.message?.includes('Unable to extract sufficient job description') ||
          result.message?.includes('paste the job description manually');
        
        if (isJobDescriptionEmpty && (jobInput.startsWith('http://') || jobInput.startsWith('https://'))) {
          // Show paste fallback UI
          setShowPasteFallback(true);
          setOriginalJobUrl(jobInput);
          setError(null); // Clear error since we're showing fallback UI
        } else {
          // Other errors - show normally
          setError(result.message || 'Analysis failed');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze job');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCoverLetterGenerated = (coverLetter: CoverLetter) => {
    if (analysis) {
      setAnalysis({
        ...analysis,
        cover_letter: coverLetter,
      });
    }
  };

  const handlePasteFallbackSubmit = async () => {
    if (!pastedDescription.trim() || pastedDescription.trim().length < 300) {
      setError('Please paste at least 300 characters of the job description');
      return;
    }

    if (!userResume) {
      setError('Please upload your resume in Account Settings first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Create job data with pasted description
      // Pass as snippet (backend uses snippet when URL fetch fails or URL is not provided)
      // Also include job_description_override in case backend supports it
      const jobData: JobInput = {
        title: '', // Will be extracted by backend if possible
        company: '', // Will be extracted by backend if possible
        url: undefined, // Don't include URL to skip fetch, use snippet directly
        snippet: pastedDescription.trim(), // Backend will use this directly
        job_description_override: pastedDescription.trim(), // Also pass as override if backend supports it
      };

      const result = await analyzeApplication(jobData, userResume);
      
      if (result.status === 'ok' && result.analysis) {
        // Success - hide paste fallback
        setShowPasteFallback(false);
        setPastedDescription('');
        setOriginalJobUrl(null);
        setAnalysis(result.analysis);
        setJob(jobData);
        if (result.analysis_id) {
          setAnalysisId(result.analysis_id);
          window.history.replaceState({}, '', `/application-lab?analysisId=${result.analysis_id}`);
        }
      } else {
        // Show backend error message
        setError(result.message || 'Analysis failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze job');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTryDifferentLink = () => {
    setShowPasteFallback(false);
    setPastedDescription('');
    setOriginalJobUrl(null);
    setJobInput('');
    setError(null);
  };

  const handleRepairResume = async () => {
    if (!userResume?.resumeUrl) {
      setError('No resume URL found. Please upload a resume first.');
      return;
    }

    setIsRepairing(true);
    setError(null);

    try {
      const result = await repairResume();
      if (result.status === 'ok') {
        // Reload resume data
        const { db } = await import('@/lib/firebase');
        const { doc, getDoc } = await import('firebase/firestore');
        if (user?.uid) {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const resumeText = userData.resumeText || userData.resume_text || '';
            const resumeData = {
              resumeText: resumeText,
              rawText: resumeText,
              resumeParsed: userData.resumeParsed || {},
              resumeUrl: userData.resumeUrl || null,
              resumeFileName: userData.resumeFileName || null,
              resumeNeedsOCR: userData.resumeNeedsOCR || false,
              ...userData.resumeParsed,
            };
            setUserResume(resumeData);
          }
        }
        setError(null);
      } else {
        setError(result.message || 'Failed to repair resume');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to repair resume');
    } finally {
      setIsRepairing(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Please sign in to use Application Lab</p>
          <Button onClick={() => navigate('/signin')}>Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full text-foreground">
        <AppSidebar />

        <MainContentWrapper>
          <AppHeader 
            title="Application Lab" 
            titleIcon={<FileText className="h-5 w-5" />}
          />

          <main className="p-8 bg-white">
            <div className="max-w-5xl mx-auto">
              {/* Error Display */}
              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-[3px] p-4 flex items-start gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900">Error</p>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-600 hover:text-red-800"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Paste Fallback UI - Show when JOB_DESCRIPTION_EMPTY error occurs */}
              {showPasteFallback && !analysis && (
                <Card className="bg-white border-border rounded-[3px]">
                  <CardHeader className="border-b border-border">
                    <CardTitle className="text-xl text-foreground flex items-center gap-2">
                      We couldn't read this job page
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div>
                      <p className="text-sm text-foreground mb-4">
                        Some job sites load job descriptions dynamically.
                        Paste the job description below to continue.
                      </p>
                      
                      <label className="block text-sm font-medium mb-2 text-foreground">
                        Job Description
                      </label>
                      <Textarea
                        value={pastedDescription}
                        onChange={(e) => setPastedDescription(e.target.value)}
                        placeholder="Paste the full job description including requirements, responsibilities, and qualifications..."
                        className="bg-white border-input text-foreground placeholder:text-muted-foreground min-h-[200px]"
                        disabled={isLoading}
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Tip: Copy the full job description including requirements.
                        {pastedDescription.length > 0 && (
                          <span className={pastedDescription.length < 300 ? 'text-yellow-600' : 'text-green-600'}>
                            {' '}({pastedDescription.length} characters, minimum 300 required)
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={handlePasteFallbackSubmit}
                        disabled={isLoading || pastedDescription.trim().length < 300 || !userResume}
                        className="bg-[#0F172A] hover:bg-[#1E293B] text-white"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 size={16} className="animate-spin mr-2" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <FileText size={16} className="mr-2" />
                            Analyze Job Description
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={handleTryDifferentLink}
                        disabled={isLoading}
                        variant="outline"
                        className="border-border hover:bg-secondary"
                      >
                        Try a different link
                      </Button>
                    </div>

                    {!userResume && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-[3px] p-4">
                        <p className="text-sm text-yellow-800">
                          Please upload your resume in{' '}
                          <button
                            onClick={() => navigate('/account-settings')}
                            className="underline font-medium"
                          >
                            Account Settings
                          </button>
                          {' '}to use Application Lab.
                        </p>
                      </div>
                    )}
                    {userResume && !userResume.resumeText && userResume.resumeUrl && (
                      <div className="bg-[#FAFBFF] border border-[#E2E8F0] rounded-[3px] p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-[#0F172A] mb-1">
                              Resume text missing
                            </p>
                            <p className="text-sm text-[#6B7280]">
                              Your resume file exists but the text content is missing. Click "Repair Resume" to extract text from your uploaded PDF.
                            </p>
                          </div>
                          <Button
                            onClick={handleRepairResume}
                            disabled={isRepairing}
                            size="sm"
                            className="bg-[#0F172A] hover:bg-[#1E293B] text-white"
                          >
                            {isRepairing ? 'Repairing...' : 'Repair Resume'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Job Input Section - Show when no analysis and not showing paste fallback */}
              {!analysis && !showPasteFallback && (
                <Card className="bg-white border-border rounded-[3px]">
                  <CardHeader className="border-b border-border">
                    <CardTitle className="text-xl text-foreground flex items-center gap-2">
                      Application Lab
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-foreground">
                        Job URL or Description
                      </label>
                      <Input
                        value={jobInput}
                        onChange={(e) => setJobInput(e.target.value)}
                        placeholder="Paste job posting URL or enter: 'Job Title at Company Name'"
                        className="bg-white border-input text-foreground placeholder:text-muted-foreground"
                        disabled={isLoading}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && !isLoading) {
                            handleAnalyze();
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Example: "Software Engineer at Google" or paste a LinkedIn job URL
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={handleAnalyze}
                        disabled={isLoading || !jobInput.trim() || !userResume}
                        className="bg-[#0F172A] hover:bg-[#1E293B] text-white"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 size={16} className="animate-spin mr-2" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <FileText size={16} className="mr-2" />
                            Analyze Application
                          </>
                        )}
                      </Button>
                    </div>

                    {!userResume && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-[3px] p-4">
                        <p className="text-sm text-yellow-800">
                          Please upload your resume in{' '}
                          <button
                            onClick={() => navigate('/account-settings')}
                            className="underline font-medium"
                          >
                            Account Settings
                          </button>
                          {' '}to use Application Lab.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Loading State */}
              {isLoading && !analysis && (
                <Card className="bg-white border-border rounded-[3px]">
                  <CardContent className="p-12 text-center">
                    <Loader2 className="animate-spin text-[#3B82F6] mx-auto mb-4" size={48} />
                    <p className="text-gray-600">Analyzing job fit...</p>
                  </CardContent>
                </Card>
              )}

              {/* Analysis Panel */}
              {analysis && job && (
                <div className="space-y-6">
                  <ApplicationLabPanel
                    analysis={analysis}
                    job={job}
                    userResume={userResume}
                    onCoverLetterGenerated={handleCoverLetterGenerated}
                  />
                  <div className="text-center">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setAnalysis(null);
                        setJob(null);
                        setAnalysisId(null);
                        setJobInput('');
                        setError(null);
                        setShowPasteFallback(false);
                        setPastedDescription('');
                        setOriginalJobUrl(null);
                        window.history.replaceState({}, '', '/application-lab');
                      }}
                      className="border-border hover:bg-secondary"
                    >
                      Analyze Another Job
                    </Button>
                  </div>
                </div>
              )}

              {/* Empty State - Only show if not loading and no analysis */}
              {!analysis && !isLoading && !error && (
                <Card className="bg-white border-border rounded-[3px]">
                  <CardContent className="p-12 text-center">
                    <FileText className="text-gray-300 mx-auto mb-4" size={48} />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                      Get Started with Application Lab
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Enter a job URL or description above to get personalized analysis and recommendations.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
