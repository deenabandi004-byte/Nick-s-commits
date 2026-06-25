import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Search } from 'lucide-react';
import { apiService, type PromptSearchResponse } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

interface PromptSearchFlowProps {
  onSearchComplete?: (contacts: any[], parsedQuery?: PromptSearchResponse['parsed_query']) => void;
  onSearchStart?: () => void;
  userTier?: 'free' | 'pro' | 'elite';
  userCredits?: number;
}

const EXAMPLE_PROMPTS = [
  "Find USC alumni in investment banking at Goldman in NYC",
  "Software engineers at Google in San Francisco",
  "Product managers at Meta in Seattle",
  "Consultants at McKinsey who went to Harvard"
];

/**
 * Simple prompt-based search flow with contact count slider.
 * 
 * This component:
 * 1. Shows prompt input with contact count slider
 * 2. Calls /api/prompt-search endpoint
 * 3. Shows parsed query and results
 */
export const PromptSearchFlow: React.FC<PromptSearchFlowProps> = ({
  onSearchComplete,
  onSearchStart,
  userTier = 'free',
  userCredits = 0,
}) => {
  const [prompt, setPrompt] = useState('');
  const [batchSize, setBatchSize] = useState<number>(1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<PromptSearchResponse | null>(null);
  const { toast } = useToast();

  // Calculate max batch size based on tier and credits (same as traditional search)
  const maxBatchSize = useMemo(() => {
    // Get tier-specific max contacts: free=3, pro=8, elite=15
    const tierMax = userTier === 'free' ? 3 : userTier === 'pro' ? 8 : 15;
    const creditMax = Math.floor((userCredits ?? 0) / 15);
    return Math.min(tierMax, creditMax);
  }, [userTier, userCredits]);

  // Ensure batchSize doesn't exceed maxBatchSize
  useEffect(() => {
    if (batchSize > maxBatchSize) {
      setBatchSize(Math.max(1, maxBatchSize));
    }
  }, [maxBatchSize, batchSize]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSearching) return;

    setIsSearching(true);
    onSearchStart?.();
    setSearchResult(null);

    try {
      const result = await apiService.promptSearch(prompt.trim(), batchSize);

      if ('error' in result) {
        toast({
          title: 'Search failed',
          description: result.error,
          variant: 'destructive',
        });
        setIsSearching(false);
        return;
      }

      setSearchResult(result);
      
      if (result.contacts.length === 0) {
        toast({
          title: 'No contacts found',
          description: 'Try using broader search terms or removing some filters',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Search complete!',
          description: `Found ${result.contacts.length} contacts`,
        });
      }

      onSearchComplete?.(result.contacts, result.parsed_query);
    } catch (error: any) {
      console.error('Error running search:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to run search. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const formatParsedQuery = (parsed: PromptSearchResponse['parsed_query']): string => {
    const parts: string[] = [];
    
    if (parsed.job_title) parts.push(parsed.job_title);
    if (parsed.company) parts.push(`at ${parsed.company}`);
    if (parsed.location) parts.push(`in ${parsed.location}`);
    if (parsed.school) parts.push(`(${parsed.school} alumni)`);
    
    return parts.join(' ') || 'No filters extracted';
  };

  return (
    <div className="w-full space-y-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            Prompt Search
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Describe who you want to reach in natural language
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSearch} className="space-y-4">
            {/* Prompt Input */}
            <div className="space-y-2">
              <Label htmlFor="prompt-input" className="text-sm font-medium">
                Search Prompt
              </Label>
              <Textarea
                id="prompt-input"
                placeholder="e.g., Find USC alumni working as product managers at Google in San Francisco"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[100px] resize-none"
                disabled={isSearching}
              />
            </div>

            {/* Example prompts */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Try these examples:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((example, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPrompt(example)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors"
                    disabled={isSearching}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {/* Email Batch Size Slider - Same as traditional search */}
            <div className="col-span-1 lg:col-span-2 mt-4">
              <div className="flex items-center gap-2 mb-4">
                <label className="text-sm font-medium text-foreground">
                  Email Batch Size
                </label>
                <span className="text-sm text-muted-foreground">
                  - Choose how many contacts to generate per search
                </span>
              </div>

              <div className="bg-muted/30 rounded-[3px] p-4 sm:p-6 border border-border shadow-lg">
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                  <div className="bg-gradient-to-br from-[#3B82F6]/20 to-[#2563EB]/20 border border-[#3B82F6]/40 rounded-[3px] px-4 py-3 min-w-[60px] sm:min-w-[70px] text-center shadow-inner">
                    <span className="text-2xl font-bold bg-gradient-to-r from-[#3B82F6] to-[#2563EB] bg-clip-text text-transparent">
                      {batchSize}
                    </span>
                  </div>

                  <div className="flex-1 w-full sm:max-w-[320px] pt-2 sm:pt-4">
                    <div className="relative">
                      <input
                        type="range"
                        min="1"
                        max={maxBatchSize}
                        value={batchSize}
                        onChange={(e) => setBatchSize(Number(e.target.value))}
                        disabled={isSearching || maxBatchSize < 1}
                        className="w-full h-3 bg-gray-700/50 rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed 
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7 
                          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                          [&::-webkit-slider-thumb]:shadow-[0_0_20px_rgba(59,130,246,0.6)] 
                          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#3B82F6]
                          [&::-webkit-slider-thumb]:hover:shadow-[0_0_25px_rgba(59,130,246,0.8)] 
                          [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-200
                          [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 
                          [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white
                          [&::-moz-range-thumb]:shadow-[0_0_20px_rgba(59,130,246,0.6)] 
                          [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#3B82F6]"
                        style={{
                          background: `linear-gradient(to right, 
                            rgba(59, 130, 246, 0.8) 0%, 
                            rgba(59, 130, 246, 0.8) ${maxBatchSize > 1 ? ((batchSize - 1) / (maxBatchSize - 1)) * 100 : 0}%, 
                            rgba(55, 65, 81, 0.3) ${maxBatchSize > 1 ? ((batchSize - 1) / (maxBatchSize - 1)) * 100 : 0}%, 
                            rgba(55, 65, 81, 0.3) 100%)`
                        }}
                      />

                      <div className="flex justify-between text-xs text-muted-foreground mt-3 font-medium">
                        <span>1</span>
                        <span>{maxBatchSize}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#FAFBFF] rounded-[3px] px-4 py-3 min-w-[80px] sm:min-w-[100px] w-full sm:w-auto border border-[#3B82F6]/30">
                    <div className="text-center">
                      <span className="text-xl font-bold text-[#3B82F6]">{batchSize * 15}</span>
                      <span className="text-sm text-[#3B82F6]/70 ml-2">credits</span>
                    </div>
                  </div>
                </div>
              </div>

              {maxBatchSize < (userTier === 'free' ? 3 : userTier === 'pro' ? 8 : 15) && (
                <div className="mt-4 bg-yellow-500/10 border border-yellow-500/30 rounded-[3px] p-3">
                  <p className="text-xs text-yellow-700 flex items-start gap-2">
                    <span>⚠️</span>
                    <span>Limited by available credits. Maximum: {maxBatchSize} contacts.</span>
                  </p>
                </div>
              )}
            </div>

            {/* Search Button */}
            <Button 
              type="submit" 
              className="w-full" 
              disabled={!prompt.trim() || isSearching}
              size="lg"
            >
              {isSearching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search Contacts
                </>
              )}
            </Button>
          </form>

          {/* Show parsed query after search */}
          {searchResult && (
            <div className="mt-6 p-4 bg-muted/50 rounded-[3px] border border-border">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Searched for:</p>
                <p className="text-sm text-muted-foreground">
                  {formatParsedQuery(searchResult.parsed_query)}
                </p>
                {searchResult.count > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Found {searchResult.count} contact{searchResult.count !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Wrapper component that provides both prompt search and traditional search
 */
export const ContactSearchWithPrompt: React.FC<{
  onSearchComplete?: (contacts: any[]) => void;
  onSearchStart?: () => void;
}> = ({ onSearchComplete, onSearchStart }) => {
  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">
          Find Your Next Connection
        </CardTitle>
        <p className="text-center text-muted-foreground">
          Search using natural language or traditional filters
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="prompt" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="prompt">✨ Prompt Search</TabsTrigger>
            <TabsTrigger value="traditional">📋 Traditional Search</TabsTrigger>
          </TabsList>
          <TabsContent value="prompt" className="mt-4">
            <PromptSearchFlow
              onSearchComplete={onSearchComplete}
              onSearchStart={onSearchStart}
            />
          </TabsContent>
          <TabsContent value="traditional" className="mt-4">
            <p className="text-sm text-muted-foreground text-center py-8">
              Traditional search form would go here. This is kept separate to maintain existing functionality.
            </p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

