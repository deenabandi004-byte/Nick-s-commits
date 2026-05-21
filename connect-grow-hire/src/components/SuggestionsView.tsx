import React, { useState } from 'react';
import {
  CheckCircle,
  AlertCircle,
  Lightbulb,
  Copy,
  ChevronDown,
  ChevronUp,
  Target,
  X,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  SuggestionsResult,
  OptimizationSuggestion,
  KeywordToAdd,
} from '@/services/api';

interface SuggestionsViewProps {
  result: SuggestionsResult;
  isOpen: boolean;
  onClose: () => void;
}

export function SuggestionsView({ result, isOpen, onClose }: SuggestionsViewProps) {
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<number>>(
    new Set([0]) // First suggestion expanded by default
  );
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const toggleSuggestion = (index: number) => {
    const newExpanded = new Set(expandedSuggestions);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSuggestions(newExpanded);
  };

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      toast({
        title: 'Copied!',
        description: 'Text copied to clipboard',
      });
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      toast({
        title: 'Failed to copy',
        description: 'Please select and copy manually',
        variant: 'destructive',
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'High Impact';
      case 'medium':
        return 'Medium Impact';
      case 'low':
        return 'Nice to Have';
      default:
        return priority;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-500" />
            Optimization Suggestions
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {/* Header with Score */}
          <div className="flex items-center justify-between p-4 bg-[#F8FAFC] rounded-[3px]">
            <div>
              <p className="text-sm text-gray-600">
                Apply these changes to your resume to improve ATS matching.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {result.suggestions?.length || 0} suggestions • {result.keywords_to_add?.length || 0} keywords to add
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-[#3B82F6]">
                {result.ats_score_estimate || 0}
              </div>
              <div className="text-xs text-gray-500">ATS Score</div>
            </div>
          </div>

          {/* Score Breakdown */}
          {result.score_breakdown && (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-gray-50 rounded-[3px] text-center">
                <div className="text-lg font-semibold text-gray-900">
                  {result.score_breakdown.keyword_match}%
                </div>
                <div className="text-xs text-gray-500">Keywords</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-[3px] text-center">
                <div className="text-lg font-semibold text-gray-900">
                  {result.score_breakdown.formatting}%
                </div>
                <div className="text-xs text-gray-500">Formatting</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-[3px] text-center">
                <div className="text-lg font-semibold text-gray-900">
                  {result.score_breakdown.relevance}%
                </div>
                <div className="text-xs text-gray-500">Relevance</div>
              </div>
            </div>
          )}

          {/* Keywords Section */}
          {(result.keywords_to_add?.length > 0 || result.keywords_found?.length > 0) && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Keywords
              </h3>

              {/* Keywords to Add */}
              {result.keywords_to_add?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Add these keywords:</p>
                  <div className="flex flex-wrap gap-2">
                    {result.keywords_to_add.map((kw: KeywordToAdd, i: number) => (
                      <div key={i} className="group relative">
                        <Badge
                          variant="outline"
                          className="cursor-help bg-[#FAFBFF] text-[#0F172A] border-[#E2E8F0] hover:bg-[rgba(59,130,246,0.10)]"
                        >
                          + {kw.keyword}
                        </Badge>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20">
                          <div className="bg-gray-900 text-white text-xs rounded-[3px] px-3 py-2 whitespace-nowrap max-w-xs">
                            <p className="font-medium">{kw.where}</p>
                            <p className="text-gray-300 mt-1">{kw.reason}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Keywords Found */}
              {result.keywords_found?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Already in your resume:</p>
                  <div className="flex flex-wrap gap-2">
                    {result.keywords_found.map((kw: string, i: number) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Suggestions List */}
          {result.suggestions?.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                Specific Changes ({result.suggestions.length})
              </h3>

              <div className="space-y-2">
                {result.suggestions.map((suggestion: OptimizationSuggestion, index: number) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-[3px] overflow-hidden"
                  >
                    {/* Suggestion Header */}
                    <div
                      onClick={() => toggleSuggestion(index)}
                      className="flex items-center gap-3 p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                    >
                      <Badge
                        variant="outline"
                        className={`text-xs ${getPriorityColor(suggestion.priority)}`}
                      >
                        {getPriorityLabel(suggestion.priority)}
                      </Badge>
                      <span className="text-sm font-medium text-gray-700 flex-1">
                        {suggestion.section}
                      </span>
                      {expandedSuggestions.has(index) ? (
                        <ChevronUp className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      )}
                    </div>

                    {/* Suggestion Content */}
                    {expandedSuggestions.has(index) && (
                      <div className="p-4 space-y-4 bg-white">
                        {/* Current Text */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-red-600 uppercase tracking-wide flex items-center gap-1">
                              <X className="w-3 h-3" />
                              Current
                            </span>
                          </div>
                          <div className="p-3 bg-red-50 border border-red-100 rounded-[3px] text-sm text-gray-700 font-mono">
                            {suggestion.current_text}
                          </div>
                        </div>

                        {/* Suggested Text */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-green-600 uppercase tracking-wide flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Suggested
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(suggestion.suggested_text, index)}
                              className="h-7 text-xs"
                            >
                              {copiedIndex === index ? (
                                <>
                                  <CheckCircle className="w-3 h-3 mr-1 text-green-500" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 mr-1" />
                                  Copy
                                </>
                              )}
                            </Button>
                          </div>
                          <div className="p-3 bg-green-50 border border-green-100 rounded-[3px] text-sm text-gray-700 font-mono">
                            {suggestion.suggested_text}
                          </div>
                        </div>

                        {/* Reason */}
                        <div className="flex items-start gap-2 p-3 bg-[#FAFBFF] border border-[#EEF2F8] rounded-[3px]">
                          <AlertCircle className="w-4 h-4 text-[#3B82F6] flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-[#0F172A]">{suggestion.reason}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overall Tips */}
          {result.overall_tips?.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-700">General Tips</h3>
              <ul className="space-y-2">
                {result.overall_tips.map((tip: string, i: number) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-600"
                  >
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-4 border-t mt-4">
          <p className="text-xs text-gray-500">
            Apply these changes to your original resume file to preserve formatting.
          </p>
          <Button onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SuggestionsView;

