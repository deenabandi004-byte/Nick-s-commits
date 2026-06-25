import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface PromptSearchInputProps {
  onParse: (prompt: string) => Promise<void>;
  isLoading?: boolean;
}

const EXAMPLE_PROMPTS = [
  "Find USC alumni in investment banking at Goldman Sachs in New York",
  "Software engineers at Google in San Francisco",
  "Consultants at McKinsey who went to Harvard",
  "Product managers at Meta in Seattle"
];

export const PromptSearchInput: React.FC<PromptSearchInputProps> = ({ 
  onParse, 
  isLoading = false 
}) => {
  const [prompt, setPrompt] = useState('');
  const [selectedExample, setSelectedExample] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    await onParse(prompt.trim());
  };

  const handleExampleClick = (example: string) => {
    setPrompt(example);
    setSelectedExample(example);
  };

  return (
    <Card className="w-full">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="prompt-input" className="text-sm font-medium flex items-center gap-2">
              Describe who you want to reach
            </label>
            <Textarea
              id="prompt-input"
              placeholder="e.g., Find USC alumni in investment banking at Goldman Sachs in New York"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setSelectedExample(null);
              }}
              className="min-h-[100px] resize-none"
              disabled={isLoading}
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
                  onClick={() => handleExampleClick(example)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selectedExample === example
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50 text-muted-foreground hover:text-foreground'
                  }`}
                  disabled={isLoading}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={!prompt.trim() || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Search...
              </>
            ) : (
              'Generate Search'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

