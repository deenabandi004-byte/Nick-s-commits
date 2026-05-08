/**
 * VoiceModelControls — Phase 4 Stretch D (per §15 #9 design decision).
 *
 * 3 plain-English controls:
 *   - Tone slider (formality_score 0-1)
 *   - Length slider (avg_length_words 40-220)
 *   - Opener dropdown
 *
 * Closer style + signature pattern are tucked under a "Show advanced"
 * toggle, NOT 5 sibling form fields. Live preview pane regenerates a
 * sample email locally as sliders move (THE magic moment); we run the
 * preview pure-client-side from a small templating function so the
 * "feel" is instant (<100ms), not the LLM-roundtrip the real generator
 * uses (where <1.5s is the target).
 *
 * Writes go to POST /api/users/voice-model which sets
 * `voiceModelManuallyEdited: true`, so the next synthesis run leaves
 * the user's choices alone.
 *
 * Behind the same DERIVED_PROFILE_ENABLED flag as the cron — caller
 * wraps the render with the flag check.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sparkles, Save, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { getAuth } from 'firebase/auth';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/services/api';

type OpenerStyle = 'direct' | 'warm' | 'contextual' | 'question' | 'none';
type CloserStyle = 'direct' | 'warm' | 'grateful' | 'none';

interface VoiceModel {
  avg_length_words: number;
  formality_score: number;
  opener_style: OpenerStyle;
  closer_style: CloserStyle;
  signature_pattern: string;
}

const DEFAULT_VOICE: VoiceModel = {
  avg_length_words: 110,
  formality_score: 0.55,
  opener_style: 'warm',
  closer_style: 'warm',
  signature_pattern: 'Best,\n{name}\n{school_short} | Class of {year}',
};

const OPENER_OPTIONS: { value: OpenerStyle; label: string; example: string }[] = [
  { value: 'warm', label: 'Warm', example: 'Hi Sarah — hope your week is off to a strong start.' },
  { value: 'direct', label: 'Direct', example: 'Sarah — I\'m a USC senior reaching out about your team.' },
  {
    value: 'contextual',
    label: 'Contextual',
    example: 'Hi Sarah — I read about your team\'s recent deal in the WSJ and wanted to reach out.',
  },
  { value: 'question', label: 'Question-led', example: 'Hi Sarah — quick question about your path into TMT M&A?' },
  { value: 'none', label: 'No pre-amble', example: 'Sarah, I\'d love a 15-min chat.' },
];

const CLOSER_OPTIONS: { value: CloserStyle; label: string }[] = [
  { value: 'warm', label: 'Warm' },
  { value: 'direct', label: 'Direct' },
  { value: 'grateful', label: 'Grateful' },
  { value: 'none', label: 'No closer' },
];

interface PreviewVars {
  recipientFirst: string;
  recipientCompany: string;
  senderName: string;
  senderSchoolShort: string;
  senderGradYear: string;
}

function renderPreview(voice: VoiceModel, vars: PreviewVars): string {
  const opener = OPENER_OPTIONS.find((o) => o.value === voice.opener_style)?.example ?? '';
  // Sub the recipient's name/company into the canned opener.
  const personalized = opener
    .replace(/Sarah/g, vars.recipientFirst || 'there')
    .replace(/USC/g, vars.senderSchoolShort || 'your school')
    .replace(/TMT M&A/g, vars.recipientCompany || 'your team');

  // Length nudges body density.
  const isShort = voice.avg_length_words < 80;
  const isLong = voice.avg_length_words >= 160;

  // Formality nudges word choice.
  const formal = voice.formality_score >= 0.7;
  const casual = voice.formality_score <= 0.35;

  let body: string;
  if (isShort) {
    body = formal
      ? `I am a ${vars.senderSchoolShort} student exploring opportunities at ${vars.recipientCompany}. Could I trouble you for fifteen minutes to ask about your path?`
      : casual
      ? `I'm a ${vars.senderSchoolShort} student trying to break into ${vars.recipientCompany}. Could I grab 15 minutes of your time?`
      : `I'm a ${vars.senderSchoolShort} student exploring ${vars.recipientCompany} and would love 15 minutes to learn about your path.`;
  } else if (isLong) {
    body = formal
      ? `I am a ${vars.senderSchoolShort} student in the Class of ${vars.senderGradYear}, exploring careers in your industry. Your trajectory at ${vars.recipientCompany} stood out — particularly the recent work I have read about in the press.\n\nIf your schedule permits, I would value fifteen minutes of your time to learn what makes your team distinctive and how you have approached the early stages of your career.`
      : `I'm a ${vars.senderSchoolShort} student (Class of ${vars.senderGradYear}) digging into your industry and your path at ${vars.recipientCompany} caught my eye — especially the recent work I've been reading about.\n\nWould you have 15 minutes to chat? I'd love to hear what makes your team different and how you thought about the early career moves that got you there.`;
  } else {
    body = formal
      ? `I am a ${vars.senderSchoolShort} student looking to learn more about ${vars.recipientCompany}. Your work caught my attention and I would value fifteen minutes of your time to hear about your path.`
      : casual
      ? `I'm a ${vars.senderSchoolShort} student trying to learn more about ${vars.recipientCompany}. Your path caught my eye — could I grab 15 minutes to chat?`
      : `I'm a ${vars.senderSchoolShort} student looking to learn more about ${vars.recipientCompany}. Your path caught my eye and I'd love 15 minutes to ask about how you got there.`;
  }

  let closer: string;
  switch (voice.closer_style) {
    case 'direct':
      closer = 'Open this week or next?';
      break;
    case 'grateful':
      closer = 'Thank you so much for considering — I really appreciate your time.';
      break;
    case 'warm':
      closer = 'Either way, appreciate the time you take to read this.';
      break;
    default:
      closer = '';
  }

  const signature = voice.signature_pattern
    .replace(/\{name\}/g, vars.senderName || 'Your name')
    .replace(/\{school_short\}/g, vars.senderSchoolShort || 'School')
    .replace(/\{year\}/g, vars.senderGradYear || 'YEAR');

  return [personalized, '', body, closer ? '\n' + closer : '', '', signature]
    .filter((p) => p !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchVoice(): Promise<{ voice: VoiceModel | null; manuallyEdited: boolean }> {
  const user = getAuth().currentUser;
  if (!user) return { voice: null, manuallyEdited: false };
  const token = await user.getIdToken();
  const resp = await fetch(`${API_BASE_URL}/users/voice-model`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return { voice: null, manuallyEdited: false };
  const data = await resp.json();
  return {
    voice: (data.voiceModel as VoiceModel) || null,
    manuallyEdited: !!data.manuallyEdited,
  };
}

async function postVoice(voice: VoiceModel): Promise<boolean> {
  const user = getAuth().currentUser;
  if (!user) return false;
  const token = await user.getIdToken();
  const resp = await fetch(`${API_BASE_URL}/users/voice-model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(voice),
  });
  return resp.ok;
}

export interface VoiceModelControlsProps {
  /** Sample data for the preview pane. Defaults to a generic example. */
  previewVars?: Partial<PreviewVars>;
  className?: string;
}

export function VoiceModelControls({ previewVars, className }: VoiceModelControlsProps) {
  const [voice, setVoice] = useState<VoiceModel>(DEFAULT_VOICE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manuallyEdited, setManuallyEdited] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchVoice().then(({ voice: v, manuallyEdited: m }) => {
      if (cancelled) return;
      if (v) setVoice({ ...DEFAULT_VOICE, ...v });
      setManuallyEdited(m);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fullPreviewVars: PreviewVars = useMemo(() => ({
    recipientFirst: 'Sarah',
    recipientCompany: 'Goldman Sachs',
    senderName: 'Alex Johnson',
    senderSchoolShort: 'USC',
    senderGradYear: '2026',
    ...(previewVars || {}),
  }), [previewVars]);

  const preview = useMemo(() => renderPreview(voice, fullPreviewVars), [voice, fullPreviewVars]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const ok = await postVoice(voice);
    if (!ok) {
      setError('Could not save — try again in a second.');
    } else {
      setSavedAt(Date.now());
      setManuallyEdited(true);
    }
    setSaving(false);
  }, [voice]);

  if (loading) {
    return (
      <Card className={cn('border-border', className)}>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your voice…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('border-border', className)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              How your emails sound
            </CardTitle>
            <CardDescription className="text-xs">
              Tune three knobs and see your sample email update on the right.
              {manuallyEdited ? ' We will not overwrite your choices.' : ''}
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          {/* === Controls === */}
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Tone</Label>
                <span className="text-xs text-muted-foreground">
                  {voice.formality_score < 0.35
                    ? 'Casual'
                    : voice.formality_score < 0.7
                    ? 'Balanced'
                    : 'Formal'}
                </span>
              </div>
              <Slider
                value={[Math.round(voice.formality_score * 100)]}
                onValueChange={([v]) =>
                  setVoice((p) => ({ ...p, formality_score: Math.max(0, Math.min(1, v / 100)) }))
                }
                min={0}
                max={100}
                step={1}
                className="mt-2"
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>Casual</span><span>Balanced</span><span>Formal</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Length</Label>
                <span className="text-xs text-muted-foreground">
                  ~{voice.avg_length_words} words
                </span>
              </div>
              <Slider
                value={[voice.avg_length_words]}
                onValueChange={([v]) =>
                  setVoice((p) => ({ ...p, avg_length_words: Math.max(40, Math.min(220, v)) }))
                }
                min={40}
                max={220}
                step={5}
                className="mt-2"
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>Short</span><span>Medium</span><span>Long</span>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Opener</Label>
              <Select
                value={voice.opener_style}
                onValueChange={(v) =>
                  setVoice((p) => ({ ...p, opener_style: v as OpenerStyle }))
                }
              >
                <SelectTrigger className="mt-2 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPENER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((s) => !s)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showAdvanced ? 'Hide advanced' : 'Show advanced'}
            </button>

            {showAdvanced ? (
              <div className="space-y-4 rounded-md border border-border/60 bg-muted/30 p-3">
                <div>
                  <Label className="text-xs font-medium">Closer style</Label>
                  <Select
                    value={voice.closer_style}
                    onValueChange={(v) =>
                      setVoice((p) => ({ ...p, closer_style: v as CloserStyle }))
                    }
                  >
                    <SelectTrigger className="mt-1.5 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLOSER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs font-medium">Signature pattern</Label>
                  <Textarea
                    value={voice.signature_pattern}
                    onChange={(e) =>
                      setVoice((p) => ({
                        ...p,
                        signature_pattern: e.target.value.slice(0, 600),
                      }))
                    }
                    className="mt-1.5 min-h-[64px] bg-background text-sm font-mono"
                    placeholder="Best,&#10;{name}&#10;{school_short} | Class of {year}"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Variables: {'{name}'}, {'{school_short}'}, {'{year}'}
                  </p>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : null}
            {savedAt ? (
              <p className="text-xs text-primary">Saved {Math.round((Date.now() - savedAt) / 1000)}s ago</p>
            ) : null}
          </div>

          {/* === Preview === */}
          <div>
            <Label className="text-sm font-medium">Sample email</Label>
            <div
              className={cn(
                'mt-2 whitespace-pre-line rounded-md border border-border bg-background p-4',
                'text-sm leading-relaxed text-foreground',
                'min-h-[260px] transition-all duration-150',
              )}
            >
              {preview}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Preview only — your real emails use this voice plus the recipient&apos;s details.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default VoiceModelControls;
