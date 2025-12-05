import { useState, useEffect } from 'react';
import { RecruitingTimelineForm } from './RecruitingTimelineForm';
import { InteractiveTimeline } from './InteractiveTimeline';
import { apiService } from '@/services/api';
import { TimelineData } from '@/types/timeline';
import { useToast } from '@/hooks/use-toast';
import { firebaseApi } from '@/services/firebaseApi';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';

export function PersonalizedRecruitingTimeline() {
  const [timelineData, setTimelineData] = useState<TimelineData | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [targetDeadline, setTargetDeadline] = useState<string>('');
  const [lastPrompt, setLastPrompt] = useState<string>(''); // Store the last prompt used
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);
  const { toast } = useToast();
  const { user } = useFirebaseAuth();

  // Load saved timeline on mount (only once)
  useEffect(() => {
    let mounted = true;
    const loadSavedTimeline = async () => {
      if (!user?.uid) {
        setIsLoadingSaved(false);
        return;
      }
      try {
        const saved = await firebaseApi.getTimeline(user.uid);
        if (mounted && saved && saved.phases && saved.phases.length > 0) {
          // Only set if we don't already have timeline data
          setTimelineData(prev => prev || { phases: saved.phases });
          setStartDate(prev => prev || saved.startDate);
          setTargetDeadline(prev => prev || saved.targetDeadline);
          // Load the last prompt if it was saved
          if (saved.lastPrompt) {
            setLastPrompt(saved.lastPrompt);
          } else {
            setLastPrompt(''); // Initialize empty if no saved prompt
          }
          console.log('✅ Loaded saved timeline:', saved);
        }
      } catch (error) {
        console.error('❌ Failed to load saved timeline:', error);
      } finally {
        if (mounted) {
          setIsLoadingSaved(false);
        }
      }
    };
    loadSavedTimeline();
    return () => {
      mounted = false;
    };
  }, [user?.uid]); // Only run when user changes

  // Save timeline whenever it changes
  const saveTimeline = async (phases: TimelineData['phases'], start: string, target: string, prompt?: string) => {
    if (!user?.uid || !phases || !start || !target) return;
    try {
      await firebaseApi.saveTimeline(user.uid, {
        phases,
        startDate: start,
        targetDeadline: target,
        lastPrompt: prompt || lastPrompt, // Save the prompt used
      });
      console.log('✅ Timeline saved');
    } catch (error) {
      console.error('❌ Failed to save timeline:', error);
    }
  };

  const handleGenerate = async (prompt: string) => {
    // If there's no existing timeline, require a prompt
    const hasExistingTimeline = timelineData && startDate && targetDeadline;
    if (!hasExistingTimeline && !prompt.trim()) {
      toast({
        variant: "destructive",
        title: "Prompt Required",
        description: "Please enter a prompt to generate your timeline.",
      });
      return;
    }
    
    // If updating and prompt is empty, allow it (user can manually edit)
    if (hasExistingTimeline && !prompt.trim()) {
      return;
    }
    
    setIsLoading(true);
    try {
      // Pass existing timeline data if updating
      const existingTimeline = hasExistingTimeline ? {
        phases: timelineData!.phases,
        startDate,
        targetDeadline,
      } : undefined;
      
      const result = await apiService.generateTimeline(prompt, hasExistingTimeline, existingTimeline);
      console.log('✅ Timeline result:', result);
      
      // Set state first to ensure UI updates immediately
      setTimelineData(result.timeline);
      setStartDate(result.startDate);
      setTargetDeadline(result.targetDeadline);
      setLastPrompt(prompt); // Store the prompt used
      
      console.log('✅ State set - timelineData:', result.timeline, 'startDate:', result.startDate, 'targetDeadline:', result.targetDeadline);
      
      // Save to Firestore (don't await - let it save in background)
      saveTimeline(result.timeline.phases, result.startDate, result.targetDeadline, prompt).catch(err => {
        console.error('❌ Failed to save timeline:', err);
        toast({
          variant: "destructive",
          title: "Save Warning",
          description: "Timeline generated but failed to save. It may not persist across sessions.",
        });
      });
      
      toast({
        title: hasExistingTimeline ? "Timeline Updated" : "Timeline Generated",
        description: hasExistingTimeline 
          ? "Your timeline has been updated!" 
          : "Your personalized recruiting timeline has been created!",
      });
    } catch (error: any) {
      console.error('❌ Failed to generate timeline:', error);
      toast({
        variant: "destructive",
        title: "Generation Failed",
        description: error.message || "Failed to generate timeline. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTimelineUpdate = async (updatedPhases: TimelineData['phases']) => {
    setTimelineData({ phases: updatedPhases });
    await saveTimeline(updatedPhases, startDate, targetDeadline);
  };

  console.log('🔍 Render - timelineData:', timelineData, 'startDate:', startDate, 'targetDeadline:', targetDeadline);

  if (isLoadingSaved) {
    return (
      <div className="space-y-6">
        <div className="text-sm text-muted-foreground">Loading timeline...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {timelineData && startDate && targetDeadline ? (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Your Recruiting Timeline</h3>
          </div>
          <InteractiveTimeline
            phases={timelineData.phases}
            startDate={startDate}
            targetDeadline={targetDeadline}
            onUpdate={handleTimelineUpdate}
          />
          
          {/* Show form below for making changes to existing timeline */}
          <div className="mt-6">
            <RecruitingTimelineForm 
              onSubmit={handleGenerate} 
              isLoading={isLoading} 
              isUpdate={true}
              existingPrompt={lastPrompt}
            />
          </div>
        </>
      ) : (
        /* Show the main form when no timeline exists */
        <RecruitingTimelineForm 
          onSubmit={handleGenerate} 
          isLoading={isLoading} 
          isUpdate={false}
        />
      )}
    </div>
  );
}

