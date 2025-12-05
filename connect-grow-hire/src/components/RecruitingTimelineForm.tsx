import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

interface RecruitingTimelineFormProps {
  onSubmit: (prompt: string) => Promise<void>;
  isLoading: boolean;
  isUpdate?: boolean; // Whether this is updating an existing timeline
  existingPrompt?: string; // Pre-filled prompt from last generation
}

export function RecruitingTimelineForm({ onSubmit, isLoading, isUpdate = false, existingPrompt = '' }: RecruitingTimelineFormProps) {
  const [prompt, setPrompt] = useState(existingPrompt);

  // Update prompt when existingPrompt changes
  useEffect(() => {
    if (existingPrompt) {
      setPrompt(existingPrompt);
    }
  }, [existingPrompt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If it's a new timeline (not an update), require a prompt
    if (!isUpdate && !prompt.trim()) {
      return;
    }
    
    // For updates, allow empty prompt (user can manually edit)
    await onSubmit(prompt.trim());
    
    // Only clear if it's a new timeline generation
    if (!isUpdate) {
      setPrompt('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 bg-card border border-border rounded-xl">
      <div className="space-y-2">
        <Label htmlFor="prompt">
          {isUpdate ? 'Update your timeline with AI (optional)' : 'Describe your recruiting goals'}
        </Label>
        <Textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            isUpdate 
              ? "e.g., Add a networking phase in December, or change the application deadline to March 2027..."
              : "e.g., I'm recruiting for Investment Banking Analyst roles starting in January 2024. I want to submit 30 applications by June 2024 and start working by August 2024."
          }
          rows={isUpdate ? 3 : 4}
          required={!isUpdate} // Required only for new timelines
          disabled={isLoading}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">
          {isUpdate ? (
            "Describe changes you want to make to your timeline. Leave empty to manually edit by dragging and clicking phases above."
          ) : (
            "Include details like: role/industry, start date, target deadline, number of applications, and any specific goals."
          )}
        </p>
      </div>

      <Button
        type="submit"
        disabled={isLoading || (!isUpdate && !prompt.trim())}
        className="w-full"
        variant={prompt.trim() || !isUpdate ? "default" : "outline"}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {isUpdate ? 'Updating Timeline...' : 'Generating Timeline...'}
          </>
        ) : (
          isUpdate 
            ? (prompt.trim() ? 'Update Timeline' : 'Generate New Timeline')
            : 'Generate Timeline'
        )}
      </Button>
    </form>
  );
}

