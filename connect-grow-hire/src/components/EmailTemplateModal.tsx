import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { EmailTemplate, PresetOption } from "@/services/api";
import { cn } from "@/lib/utils";

const MAX_CUSTOM_LEN = 4000;

const PREVIEWS: Record<string, string> = {
  "networking_casual": "Hi Alex,\n\nI'm Sid, CS at USC - been geeking out over Google's search infra work lately. Curious what your day-to-day actually looks like on the team. Down for a quick 15-min chat sometime?\n\nThanks,\nSid",
  "networking_professional": "Hi Alex,\n\nMy name is Sid, and I'm a junior studying Computer Science at USC. I came across your profile while researching engineering roles at Google, and your work on search infrastructure stood out. Would you be available for a brief 15-20 minute conversation?\n\nBest regards,\nSid",
  "sales_bold_confident": "Hi Alex,\n\nMost career platforms give students a job board and call it a day. We built Offerloop - it finds the right people at the right companies and writes personalized outreach in seconds. 1,000+ students are using it. Worth a 15-min demo?\n\nThanks,\nSid",
  "referral_warm_enthusiastic": "Hi Alex,\n\nI'm Sid, a CS student at USC, and I've been genuinely excited about the engineering work at Google. I noticed there's an open SWE role and your team's search infrastructure work is exactly the kind of problem I want to tackle. Would you be open to referring me or pointing me to the right person?\n\nReally appreciate it,\nSid",
  "follow_up_short_direct": "Hi Alex,\n\nFollowing up on my note last week. Saw Google just announced the new search features - congrats to the team. Still happy to chat for 15 min if you have time.\n\nThanks,\nSid",
};

const CUSTOM_PURPOSE_ID = "custom";

function getPreviewKey(purpose: string | null, stylePreset: string | null): string | null {
  if (!purpose || purpose === "custom" || !stylePreset) return null;
  const key = `${purpose}_${stylePreset}`;
  return PREVIEWS[key] ? key : null;
}

export interface EmailTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  savedTemplate: EmailTemplate | null;
  activeTemplate: EmailTemplate | null;
  presets: { styles: PresetOption[]; purposes: PresetOption[] } | null;
  onSaveAsDefault: (template: EmailTemplate) => Promise<void>;
  onApply: (template: EmailTemplate) => void;
  isSaving?: boolean;
}

export const EmailTemplateModal: React.FC<EmailTemplateModalProps> = ({
  open,
  onOpenChange,
  savedTemplate,
  activeTemplate,
  presets,
  onSaveAsDefault,
  onApply,
  isSaving = false,
}) => {
  const [purpose, setPurpose] = useState<string | null>("networking");
  const [customPurposeText, setCustomPurposeText] = useState("");
  const [stylePreset, setStylePreset] = useState<string | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [signoffOpen, setSignoffOpen] = useState(false);
  const [signoffPhrase, setSignoffPhrase] = useState("Best,");
  const [signoffPhraseCustom, setSignoffPhraseCustom] = useState("");
  const [signatureBlock, setSignatureBlock] = useState("");

  const effectivePurpose = purpose === CUSTOM_PURPOSE_ID ? "custom" : purpose;
  const effectiveSignoff = signoffPhrase === "custom" ? (signoffPhraseCustom.trim() || "Best,") : signoffPhrase;

  useEffect(() => {
    if (open) {
      const t = activeTemplate || savedTemplate;
      if (t) {
        const p = t.purpose;
        if (p === "custom") {
          setPurpose(CUSTOM_PURPOSE_ID);
          setCustomPurposeText(t.customInstructions || "");
          setCustomInstructions("");
        } else {
          setPurpose(p || "networking");
          setCustomPurposeText("");
          setCustomInstructions(t.customInstructions || "");
        }
        setStylePreset(t.stylePreset ?? null);
        const sp = (t as EmailTemplate & { signoffPhrase?: string }).signoffPhrase;
        if (sp && ["Best,", "Thanks,", "Warm regards,", "Sincerely,", "Cheers,"].includes(sp)) {
          setSignoffPhrase(sp);
          setSignoffPhraseCustom("");
        } else if (sp) {
          setSignoffPhrase("custom");
          setSignoffPhraseCustom(sp);
        }
        setSignatureBlock((t as EmailTemplate & { signatureBlock?: string }).signatureBlock ?? "");
      } else {
        setPurpose("networking");
        setCustomPurposeText("");
        setStylePreset(null);
        setCustomInstructions("");
        setSignoffPhrase("Best,");
        setSignoffPhraseCustom("");
        setSignatureBlock("");
      }
    }
  }, [open, activeTemplate, savedTemplate]);

  const buildTemplate = (): EmailTemplate => {
    const custom = effectivePurpose === "custom"
      ? (customPurposeText.trim().slice(0, MAX_CUSTOM_LEN) + (customInstructions.trim() ? "\n\n" + customInstructions.trim().slice(0, MAX_CUSTOM_LEN) : "")).slice(0, MAX_CUSTOM_LEN)
      : customInstructions.trim().slice(0, MAX_CUSTOM_LEN);
    return {
      purpose: effectivePurpose,
      stylePreset,
      customInstructions: custom,
      signoffPhrase: effectiveSignoff,
      signatureBlock: signatureBlock.trim().slice(0, 500),
    };
  };

  const handleReset = () => {
    setPurpose("networking");
    setCustomPurposeText("");
    setStylePreset(null);
    setCustomInstructions("");
    setSignoffPhrase("Best,");
    setSignoffPhraseCustom("");
    setSignatureBlock("");
  };

  const handleSaveAsDefault = async () => {
    await onSaveAsDefault(buildTemplate());
    onOpenChange(false);
  };

  const handleApply = () => {
    onApply(buildTemplate());
    onOpenChange(false);
  };

  const previewKey = getPreviewKey(effectivePurpose === "custom" ? "networking" : effectivePurpose, stylePreset);
  const previewBody = previewKey ? PREVIEWS[previewKey] : null;

  const purposeOptions = presets?.purposes ?? [];
  const styleOptions = presets?.styles ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email template</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Part A - Purpose */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">What kind of email?</Label>
            <div className="flex flex-wrap gap-2">
              {purposeOptions.filter((p) => p.id !== "custom").map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPurpose(opt.id)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                    purpose === opt.id
                      ? "bg-[#0F172A] text-white border-[#0F172A]"
                      : "bg-white text-gray-700 border-gray-200 hover:border-[#3B82F6] hover:bg-[#FAFBFF]"
                  )}
                >
                  {opt.name}
                  {opt.id === "networking" && " (default)"}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPurpose(CUSTOM_PURPOSE_ID)}
                className={cn(
                  "px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                  purpose === CUSTOM_PURPOSE_ID
                    ? "bg-[#0F172A] text-white border-[#0F172A]"
                    : "bg-white text-gray-700 border-gray-200 hover:border-[#3B82F6] hover:bg-[#FAFBFF]"
                )}
              >
                Custom purpose
              </button>
            </div>
            {purpose === CUSTOM_PURPOSE_ID && (
              <Textarea
                placeholder="e.g. pitch my startup to university career centers"
                value={customPurposeText}
                onChange={(e) => setCustomPurposeText(e.target.value.slice(0, MAX_CUSTOM_LEN))}
                className="mt-2 min-h-[80px] resize-none"
                maxLength={MAX_CUSTOM_LEN}
              />
            )}
          </div>

          {/* Part B - Style */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">How should it sound?</Label>
            <div className="flex flex-wrap gap-2">
              {styleOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStylePreset(opt.id)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                    stylePreset === opt.id
                      ? "bg-[#0F172A] text-white border-[#0F172A]"
                      : "bg-white text-gray-700 border-gray-200 hover:border-[#3B82F6] hover:bg-[#FAFBFF]"
                  )}
                >
                  {opt.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setStylePreset(null)}
                className={cn(
                  "px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                  stylePreset === null
                    ? "bg-gray-200 text-gray-800 border-gray-300"
                    : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                )}
              >
                No preference
              </button>
            </div>
          </div>

          {/* Part C - Custom instructions (always visible) */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-700">Additional instructions (optional)</Label>
            <Textarea
              placeholder="e.g., Keep it under 3 sentences, mention my USC background, reference the specific role I'm applying for"
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value.slice(0, MAX_CUSTOM_LEN))}
              className="min-h-[80px] resize-none"
              maxLength={MAX_CUSTOM_LEN}
            />
            <p className="text-xs text-gray-500">
              {MAX_CUSTOM_LEN - customInstructions.length} characters left. Add extra instructions on top of your purpose and style.
            </p>
          </div>

          {/* Part D - Sign-off & signature (collapsible) */}
          <Collapsible open={signoffOpen} onOpenChange={setSignoffOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left text-sm font-semibold text-gray-700 hover:text-gray-900"
              >
                {signoffOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Sign-off & signature
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="flex flex-wrap gap-2">
                {["Best,", "Thanks,", "Warm regards,", "Sincerely,", "Cheers,"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => { setSignoffPhrase(preset); setSignoffPhraseCustom(""); }}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-full border",
                      signoffPhrase === preset ? "bg-[#FAFBFF] text-[#0F172A] border-[#E2E8F0]" : "bg-white border-gray-200"
                    )}
                  >
                    {preset}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSignoffPhrase("custom")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-full border",
                    signoffPhrase === "custom" ? "bg-[#FAFBFF] text-[#0F172A] border-[#E2E8F0]" : "bg-white border-gray-200"
                  )}
                >
                  Custom
                </button>
                {signoffPhrase === "custom" && (
                  <Input
                    placeholder="e.g. Best regards,"
                    value={signoffPhraseCustom}
                    onChange={(e) => setSignoffPhraseCustom(e.target.value.slice(0, 50))}
                    className="inline-flex w-[140px] h-8 text-xs rounded-full"
                    maxLength={50}
                  />
                )}
              </div>
              <div>
                <Label className="text-xs font-medium text-gray-600">Signature block (optional)</Label>
                <Textarea
                  placeholder="Name, university, email..."
                  value={signatureBlock}
                  onChange={(e) => setSignatureBlock(e.target.value.slice(0, 500))}
                  className="mt-1 min-h-[60px] resize-none text-sm"
                  maxLength={500}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Preview */}
          <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <Label className="text-sm font-semibold text-gray-700">Preview</Label>
            <p className="text-xs text-gray-500">Actual emails will be personalized to each contact.</p>
            {previewBody ? (
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{previewBody}</pre>
            ) : (
              <p className="text-sm text-gray-500 italic">Preview not available for this combination - your emails will still be personalized based on your selections.</p>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Reset
          </button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleApply} disabled={isSaving}>
              Apply to this search
            </Button>
            <Button onClick={handleSaveAsDefault} disabled={isSaving}>
              {isSaving ? "Saving…" : "Save as default"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
