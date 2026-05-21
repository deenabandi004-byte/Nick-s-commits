import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Lightbulb,
  LayoutTemplate,
  CheckCircle,
  TrendingUp,
  Upload,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  apiService,
  ResumeInfo,
  OptimizationMode,
  SuggestionsResult,
  TemplateRebuildResult,
  downloadPdfBlob,
  isSuggestionsResult,
} from '@/services/api';
import { LoadingContainer, InlineLoadingBar } from '@/components/ui/LoadingBar';

interface ResumeOptimizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobDescription: string;
  jobTitle?: string;
  company?: string;
  jobUrl?: string;
  onSuggestionsReceived?: (result: SuggestionsResult) => void;
  onTemplateRebuildReceived?: (result: TemplateRebuildResult) => void;
}

export function ResumeOptimizationModal({
  isOpen,
  onClose,
  jobDescription,
  jobTitle,
  company,
  jobUrl,
  onSuggestionsReceived,
  onTemplateRebuildReceived,
}: ResumeOptimizationModalProps) {
  const [resumeInfo, setResumeInfo] = useState<ResumeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadResumeCapabilities();
    }
  }, [isOpen]);

  const loadResumeCapabilities = async () => {
    setLoading(true);
    try {
      const info = await apiService.getResumeCapabilities();
      setResumeInfo(info);

      // Auto-select recommended mode
      const availableModes = info.resumeCapabilities?.availableModes || [];
      const recommended = availableModes.find((m) => m.recommended);
      if (recommended) {
        setSelectedMode(recommended.id);
      } else if (availableModes.length > 0) {
        setSelectedMode(availableModes[0].id);
      }
    } catch (error) {
      console.error('Failed to load resume info:', error);
      toast({
        title: 'Error',
        description: 'Failed to load resume information',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    if (!selectedMode) return;

    setOptimizing(true);
    try {
      const result = await apiService.optimizeResumeV2(
        jobDescription,
        selectedMode as 'direct_edit' | 'suggestions' | 'template_rebuild',
        jobTitle,
        company,
        jobUrl
      );

      if (result instanceof Blob) {
        // PDF returned - download it
        const filename = `optimized_resume_${company?.replace(/\s+/g, '_') || 'ats'}.pdf`;
        downloadPdfBlob(result, filename);

        toast({
          title: 'Resume Optimized!',
          description: 'Your formatted resume has been downloaded.',
        });

        onClose();
      } else if (isSuggestionsResult(result)) {
        // Suggestions mode
        toast({
          title: 'Suggestions Ready!',
          description: `We found ${result.suggestions?.length || 0} ways to improve your resume.`,
        });

        onSuggestionsReceived?.(result);
        onClose();
      } else {
        // Template rebuild
        toast({
          title: 'Resume Rebuilt!',
          description: 'Your resume has been rebuilt with optimized content.',
        });

        onTemplateRebuildReceived?.(result);
        onClose();
      }
    } catch (error: any) {
      console.error('Optimization failed:', error);
      toast({
        title: 'Optimization Failed',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setOptimizing(false);
    }
  };

  const getModeIcon = (modeId: string) => {
    switch (modeId) {
      case 'direct_edit':
        return <FileText className="w-5 h-5" />;
      case 'suggestions':
        return <Lightbulb className="w-5 h-5" />;
      case 'template_rebuild':
        return <LayoutTemplate className="w-5 h-5" />;
      default:
        return <TrendingUp className="w-5 h-5" />;
    }
  };

  // Loading state
  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg">
          <LoadingContainer 
            label="Loading resume information..." 
            sublabel="Please wait" 
          />
        </DialogContent>
      </Dialog>
    );
  }

  // No resume uploaded
  if (!resumeInfo?.hasResume) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>No Resume Found</DialogTitle>
            <DialogDescription>
              Please upload a resume first to use optimization.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-6 gap-4">
            <AlertCircle className="w-12 h-12 text-gray-400" />
            <p className="text-sm text-gray-600 text-center">
              Upload a resume in Account Settings to get started.
            </p>
            <Button onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const capabilities = resumeInfo.resumeCapabilities;
  const availableModes = capabilities?.availableModes || [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Optimize Resume</DialogTitle>
          <DialogDescription>
            Choose how you'd like to optimize your resume for this job.
          </DialogDescription>
        </DialogHeader>

        {/* Current Resume Info */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-[3px]">
          <FileText className="w-5 h-5 text-gray-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {resumeInfo.resumeFileName || 'resume.pdf'}
            </p>
            <p className="text-xs text-gray-500">
              {resumeInfo.resumeFileType?.toUpperCase()} file
            </p>
          </div>
          {capabilities?.canEditDirectly && (
            <Badge
              variant="outline"
              className="text-green-600 border-green-200 bg-green-50 text-xs"
            >
              <CheckCircle className="w-3 h-3 mr-1" />
              Format-preserving ready
            </Badge>
          )}
        </div>

        {/* Mode Selection */}
        <div className="space-y-3 mt-4">
          <p className="text-sm font-medium text-gray-700">
            Choose optimization mode:
          </p>

          {availableModes.map((mode: OptimizationMode) => (
            <div
              key={mode.id}
              onClick={() => !optimizing && setSelectedMode(mode.id)}
              className={`
                relative p-4 rounded-[3px] border-2 cursor-pointer transition-all
                ${optimizing ? 'opacity-50 cursor-not-allowed' : ''}
                ${
                  selectedMode === mode.id
                    ? 'border-[#3B82F6] bg-[#FAFBFF]'
                    : 'border-gray-200 hover:border-gray-300'
                }
              `}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`
                    p-2 rounded-[3px]
                    ${
                      selectedMode === mode.id
                        ? 'bg-[rgba(59,130,246,0.10)] text-[#3B82F6]'
                        : 'bg-gray-100 text-gray-500'
                    }
                  `}
                >
                  {getModeIcon(mode.id)}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium text-gray-900">{mode.name}</h4>
                    {mode.recommended && (
                      <Badge className="bg-[rgba(59,130,246,0.10)] text-[#2563EB] text-xs">
                        Recommended
                      </Badge>
                    )}
                    {mode.preservesFormatting && (
                      <Badge variant="outline" className="text-xs">
                        Keeps formatting
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{mode.description}</p>
                </div>

                {/* Radio indicator */}
                <div
                  className={`
                    w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                    ${selectedMode === mode.id ? 'border-[#3B82F6]' : 'border-gray-300'}
                  `}
                >
                  {selectedMode === mode.id && (
                    <div className="w-3 h-3 rounded-full bg-[#3B82F6]" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* DOCX Upload Suggestion (for PDF users) */}
        {resumeInfo.resumeFileType === 'pdf' && (
          <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-[3px] mt-4">
            <Upload className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-amber-800">
                <span className="font-medium">Tip:</span> Upload a DOCX file for
                automatic formatting preservation.
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={onClose} disabled={optimizing}>
            Cancel
          </Button>
          <Button
            onClick={handleOptimize}
            disabled={!selectedMode || optimizing}
            className="relative overflow-hidden"
          >
            {optimizing ? (
              'Optimizing...'
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" />
                Optimize (20 credits)
              </>
            )}
            <InlineLoadingBar isLoading={optimizing} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ResumeOptimizationModal;

