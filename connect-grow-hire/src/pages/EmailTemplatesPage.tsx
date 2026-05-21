import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ChevronRight, ChevronDown, X, LockKeyhole } from "lucide-react";
import { apiService } from "@/services/api";
import type { EmailTemplate, PresetOption, SavedEmailTemplate } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

const MAX_CUSTOM_LEN = 4000;

const PREVIEWS: Record<string, string> = {
  networking:
    "Hi Alex,\n\nMy name is Deena, and I'm a junior studying Computer Science at USC. I came across your profile while researching engineering roles at Google, and your work on search infrastructure stood out. Would you be available for a brief 15–20 minute conversation at your convenience?\n\nBest regards,\nDeena",
  referral:
    "Hi Alex,\n\nMy name is Deena, and I'm a junior studying Computer Science at USC. I noticed an open Software Engineer position on your team at Google that aligns well with my experience. Would you be open to referring me or connecting me with the appropriate hiring contact?\n\nThank you for your time,\nDeena",
  follow_up:
    "Hi Alex,\n\nI wanted to follow up on my previous message. I understand you have a busy schedule, and I'd still welcome the opportunity to speak with you briefly if your availability allows. Please don't hesitate to suggest a time that works best.\n\nBest regards,\nDeena",
};

const PURPOSE_DESCRIPTIONS: Record<string, string> = {
  networking: "Request a meeting or informational interview to learn about their role and company.",
  referral: "Ask to be referred for a specific job opening at their company.",
  follow_up: "Follow up on a previous email or conversation that didn't get a reply.",
};

const PURPOSE_PILLS = [
  { id: "networking", name: "Networking" },
  { id: "referral", name: "Referral Request" },
  { id: "follow_up", name: "Follow-Up" },
] as const;

const CUSTOM_PURPOSE_ID = "custom";

function getPreview(key: string, firstName: string): string {
  const raw = PREVIEWS[key];
  if (!raw) return "";
  const name = (firstName || "Deena").trim() || "Deena";
  return raw.replace(/\bDeena\b/g, name);
}

export default function EmailTemplatesPage() {
  const navigate = useNavigate();
  const { user } = useFirebaseAuth();
  const isElite = user?.tier === "elite";
  const firstName = (user?.name?.trim().split(/\s+/)[0] || "Deena").trim() || "Deena";
  const [savedTemplate, setSavedTemplate] = useState<EmailTemplate | null>(null);
  const [presets, setPresets] = useState<{ styles: PresetOption[]; purposes: PresetOption[] } | null>(null);
  const [purpose, setPurpose] = useState<string | null>("networking");
  const [customInstructions, setCustomInstructions] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [subjectLine, setSubjectLine] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedCustomTemplates, setSavedCustomTemplates] = useState<SavedEmailTemplate[]>([]);
  const [activeSavedTemplateId, setActiveSavedTemplateId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [signoffPhrase, setSignoffPhrase] = useState("Best,");
  const [signoffPhraseCustom, setSignoffPhraseCustom] = useState("");
  const [signatureBlock, setSignatureBlock] = useState("");

  const effectivePurpose = purpose === CUSTOM_PURPOSE_ID ? "custom" : purpose;
  const effectiveSignoff = signoffPhrase === "custom" ? (signoffPhraseCustom.trim() || "Best,") : signoffPhrase;

  useEffect(() => {
    Promise.all([
      apiService.getEmailTemplate(),
      apiService.getEmailTemplatePresets(),
      apiService.getSavedEmailTemplates(),
    ])
      .then(([template, presetsData, saved]) => {
        setSavedTemplate({
          purpose: template.purpose ?? null,
          stylePreset: template.stylePreset ?? null,
          customInstructions: template.customInstructions ?? "",
          signoffPhrase: template.signoffPhrase,
          signatureBlock: template.signatureBlock,
          name: template.name,
          subject: template.subject,
          savedTemplateId: template.savedTemplateId,
        });
        setSignoffPhrase(
          ["Best,", "Thanks,", "Warm regards,", "Sincerely,", "Cheers,"].includes((template as any).signoffPhrase)
            ? (template as any).signoffPhrase
            : "custom"
        );
        setSignoffPhraseCustom(
          ["Best,", "Thanks,", "Warm regards,", "Sincerely,", "Cheers,"].includes((template as any).signoffPhrase)
            ? ""
            : ((template as any).signoffPhrase || "")
        );
        setSignatureBlock((template as any).signatureBlock ?? "");
        setPresets(presetsData);
        setSavedCustomTemplates(saved);
        const p = template.purpose;
        if (p === "custom") {
          setPurpose(CUSTOM_PURPOSE_ID);
          setCustomInstructions(template.customInstructions || "");
          setTemplateName(template.name || "");
          setSubjectLine(template.subject || "");
          setActiveSavedTemplateId(template.savedTemplateId || null);
        } else if (template.savedTemplateId) {
          const match = saved.find((s) => s.id === template.savedTemplateId);
          if (match) {
            setPurpose(CUSTOM_PURPOSE_ID);
            setTemplateName(match.name);
            setSubjectLine(match.subject);
            setCustomInstructions(match.body);
            setActiveSavedTemplateId(match.id);
          } else {
            setPurpose(p || "networking");
          }
        } else {
          setPurpose(p || "networking");
          setCustomInstructions("");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const buildTemplate = (): EmailTemplate => {
    const custom = customInstructions.trim().slice(0, MAX_CUSTOM_LEN);
    return {
      purpose: effectivePurpose,
      stylePreset: null,
      customInstructions: custom,
      signoffPhrase: effectiveSignoff,
      signatureBlock: signatureBlock.trim().slice(0, 500),
      name: templateName.trim(),
      subject: subjectLine.trim(),
      savedTemplateId: activeSavedTemplateId || undefined,
    };
  };

  const handleReset = () => {
    setPurpose("networking");
    setCustomInstructions("");
    setTemplateName("");
    setSubjectLine("");
    setActiveSavedTemplateId(null);
    setSignoffPhrase("Best,");
    setSignoffPhraseCustom("");
    setSignatureBlock("");
  };

  const handlePurposeClick = (id: string) => {
    setPurpose(id);
    setActiveSavedTemplateId(null);
    setTemplateName("");
    setSubjectLine("");
    setCustomInstructions("");
  };

  const handleSavedTemplateClick = (t: SavedEmailTemplate) => {
    setPurpose(CUSTOM_PURPOSE_ID);
    setTemplateName(t.name);
    setSubjectLine(t.subject);
    setCustomInstructions(t.body);
    setActiveSavedTemplateId(t.id);
  };

  const expandCreateYourOwn = () => {
    setPurpose(CUSTOM_PURPOSE_ID);
    setActiveSavedTemplateId(null);
    setTemplateName("");
    setSubjectLine("");
    setCustomInstructions("");
  };

  const handleDeleteSavedTemplate = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await apiService.deleteSavedEmailTemplate(id);
      setSavedCustomTemplates((prev) => prev.filter((t) => t.id !== id));
      if (activeSavedTemplateId === id) {
        setActiveSavedTemplateId(null);
        setTemplateName("");
        setSubjectLine("");
        setCustomInstructions("");
        setPurpose("networking");
      }
      toast({ title: "Deleted", description: "Custom template removed." });
    } catch {
      toast({ title: "Failed", description: "Could not delete template.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveAsDefault = async () => {
    if (purpose === CUSTOM_PURPOSE_ID && !templateName.trim()) {
      toast({ title: "Name required", description: "Please enter a template name before saving.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      let savedId = activeSavedTemplateId;

      // Try to save named custom template (non-blocking for default save)
      if (purpose === CUSTOM_PURPOSE_ID) {
        try {
          const res = await apiService.createSavedEmailTemplate({
            id: activeSavedTemplateId || undefined,
            name: templateName.trim(),
            subject: subjectLine.trim(),
            body: customInstructions.trim(),
          });
          savedId = res.id;
          setActiveSavedTemplateId(savedId);

          const newEntry: SavedEmailTemplate = {
            id: savedId,
            name: templateName.trim(),
            subject: subjectLine.trim(),
            body: customInstructions.trim(),
          };
          setSavedCustomTemplates((prev) => {
            const idx = prev.findIndex((t) => t.id === savedId);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = newEntry;
              return copy;
            }
            return [newEntry, ...prev];
          });
        } catch (err) {
          console.error("Failed to save named template, continuing with default save:", err);
        }
      }

      // ALWAYS save the default template (this is the critical save)
      const template = buildTemplate();
      template.savedTemplateId = savedId || undefined;
      await apiService.saveEmailTemplate(template);
      setSavedTemplate(template);
      toast({ title: "Saved", description: "Email template saved as your default." });
    } catch (err) {
      console.error("Save template error:", err);
      toast({ title: "Failed to save", description: "Could not save template.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyToSearch = () => {
    const template = buildTemplate();
    try {
      sessionStorage.setItem("offerloop_applied_email_template", JSON.stringify(template));
    } catch {
      // ignore
    }
    navigate("/find", { state: { appliedEmailTemplate: template } });
    toast({ title: "Applied", description: "Template will be used for your next search." });
  };

  const hasPresetPurpose = purpose && purpose !== CUSTOM_PURPOSE_ID;
  const isMakeYourOwn = purpose === CUSTOM_PURPOSE_ID;
  const previewKey = hasPresetPurpose && purpose ? purpose : null;
  const previewBody = previewKey && PREVIEWS[previewKey] ? getPreview(previewKey, firstName) : null;

  if (loading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full" style={{ background: 'var(--warm-bg, #FEFDFB)' }}>
          <AppSidebar />
          <MainContentWrapper>
            <AppHeader />
            <main className="flex-1 flex items-center justify-center p-8">
              <p style={{ color: 'var(--warm-ink-tertiary, #9C9590)' }}>Loading…</p>
            </main>
          </MainContentWrapper>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full font-sans" style={{ background: 'var(--warm-bg, #FEFDFB)' }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Email Template" />
          <main className="flex-1 overflow-y-auto" style={{ background: 'var(--warm-bg, #FEFDFB)', padding: "0 40px 64px" }}>
            <div className="max-w-[800px] mx-auto" data-tour="tour-templates">
              <button
                type="button"
                onClick={() => navigate("/find")}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 24,
                  marginBottom: 20,
                  fontSize: 13,
                  color: 'var(--warm-ink-tertiary, #9C9590)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: 0,
                  transition: 'color .12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#1A1714'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--warm-ink-tertiary, #9C9590)'; }}
              >
                <ArrowLeft style={{ width: 14, height: 14 }} />
                Back to Find
              </button>

              <h1
                style={{
                  fontFamily: "'Lora', Georgia, serif",
                  fontWeight: 600,
                  fontSize: 22,
                  color: '#1A1714',
                  marginBottom: 6,
                }}
              >
                Email template
              </h1>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: 'var(--warm-ink-tertiary, #9C9590)',
                  marginBottom: 28,
                }}
              >
                This controls how your outreach emails are written. Pick what you're asking for and how you want it to sound - check the preview below to see exactly what you'll get.
              </p>

              {/* Purpose pills - defaults + saved custom templates */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#3B3530', display: 'block', marginBottom: 8 }}>What kind of email?</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PURPOSE_PILLS.map((pill) => {
                    const isActive = purpose === pill.id && !activeSavedTemplateId;
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => handlePurposeClick(pill.id)}
                        style={{
                          padding: '8px 16px',
                          fontSize: 12,
                          fontWeight: 500,
                          borderRadius: 8,
                          border: isActive ? '1.5px solid #1A1714' : '1px solid var(--warm-border, #E8E4DE)',
                          background: isActive ? '#1A1714' : 'var(--warm-surface, #FAFBFF)',
                          color: isActive ? '#fff' : '#3B3530',
                          cursor: 'pointer',
                          transition: 'all .15s',
                          fontFamily: 'inherit',
                        }}
                      >
                        {pill.name}
                        {pill.id === "networking" && " (default)"}
                      </button>
                    );
                  })}
                  {isElite && savedCustomTemplates.map((t) => {
                    const isActive = activeSavedTemplateId === t.id;
                    return (
                      <div key={t.id} className="relative group">
                        <button
                          type="button"
                          onClick={() => handleSavedTemplateClick(t)}
                          style={{
                            padding: '8px 16px',
                            paddingRight: 28,
                            fontSize: 12,
                            fontWeight: 500,
                            borderRadius: 8,
                            border: isActive ? '1.5px solid #1A1714' : '1px solid var(--warm-border, #E8E4DE)',
                            background: isActive ? '#1A1714' : 'var(--warm-surface, #FAFBFF)',
                            color: isActive ? '#fff' : '#3B3530',
                            cursor: 'pointer',
                            transition: 'all .15s',
                            fontFamily: 'inherit',
                          }}
                        >
                          {t.name}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete "${t.name}"?`)) {
                              handleDeleteSavedTemplate(t.id);
                            }
                          }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-red-100"
                          aria-label={`Delete ${t.name}`}
                        >
                          <X className="h-3 w-3 text-red-500" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {hasPresetPurpose && !activeSavedTemplateId && PURPOSE_DESCRIPTIONS[purpose!] && (
                  <p style={{ marginTop: 8, fontSize: 12, color: 'var(--warm-ink-tertiary, #9C9590)' }}>
                    {PURPOSE_DESCRIPTIONS[purpose!]}
                  </p>
                )}
              </div>

              {/* Create Your Own Template - expandable card (Elite only) */}
              {isElite ? (
              <div
                role="button"
                tabIndex={0}
                onClick={isMakeYourOwn ? undefined : expandCreateYourOwn}
                onKeyDown={(e) => {
                  if (!isMakeYourOwn && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    expandCreateYourOwn();
                  }
                }}
                style={{
                  width: '100%',
                  borderRadius: 12,
                  border: isMakeYourOwn ? '1.5px solid #1A1714' : '1px solid var(--warm-border, #E8E4DE)',
                  padding: '16px 20px',
                  marginBottom: 28,
                  cursor: isMakeYourOwn ? 'default' : 'pointer',
                  background: isMakeYourOwn ? '#FFFFFF' : 'var(--warm-surface, #FAFBFF)',
                  transition: 'all .15s',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}
                  onClick={isMakeYourOwn ? (e) => { e.stopPropagation(); setPurpose("networking"); } : undefined}
                  role={isMakeYourOwn ? "button" : undefined}
                  tabIndex={isMakeYourOwn ? 0 : undefined}
                  onKeyDown={
                    isMakeYourOwn
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setPurpose("networking");
                          }
                        }
                      : undefined
                  }
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#3B3530' }}>Create Your Own Template</span>
                  {isMakeYourOwn ? (
                    <ChevronDown style={{ width: 14, height: 14, color: 'var(--warm-ink-tertiary, #9C9590)' }} />
                  ) : (
                    <ChevronRight style={{ width: 14, height: 14, color: 'var(--warm-ink-tertiary, #9C9590)' }} />
                  )}
                </div>
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-200 ease-out",
                    isMakeYourOwn ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
                  )}
                >
                  <div
                    style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--warm-border, #E8E4DE)', display: 'flex', flexDirection: 'column', gap: 16 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 500, color: '#3B3530', display: 'block', marginBottom: 6 }}>Template Name</label>
                      <Input
                        placeholder="e.g., Startup Pitch, Informational Interview Request..."
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value.slice(0, 200))}
                        className="w-full rounded-lg border-[#E8E4DE] bg-[#FAF9F6] text-[#1A1714] placeholder:text-[#9C9590] focus:bg-white focus:ring-2 focus:ring-[#1A1714]/10 focus:border-[#1A1714]"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 500, color: '#3B3530', display: 'block', marginBottom: 6 }}>Email Subject Line</label>
                      <Input
                        placeholder="e.g., Quick question from a fellow USC Trojan"
                        value={subjectLine}
                        onChange={(e) => setSubjectLine(e.target.value.slice(0, 500))}
                        className="w-full rounded-lg border-[#E8E4DE] bg-[#FAF9F6] text-[#1A1714] placeholder:text-[#9C9590] focus:bg-white focus:ring-2 focus:ring-[#1A1714]/10 focus:border-[#1A1714]"
                      />
                    </div>
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--warm-ink-tertiary, #9C9590)', lineHeight: 1.5, marginBottom: 8 }}>
                        Describe exactly what you want your emails to say - in plain English. Want to pitch your startup? Ask for an intro to their manager? Request a campus speaking slot? Just type it out.
                      </p>
                      <Textarea
                        placeholder="e.g., Write a 3-sentence email pitching my startup to university career center directors and asking for a 15-minute demo call..."
                        value={customInstructions}
                        onChange={(e) => setCustomInstructions(e.target.value.slice(0, MAX_CUSTOM_LEN))}
                        className="min-h-[72px] resize-y w-full rounded-lg border-[#E8E4DE] bg-[#FAF9F6] text-[#1A1714] placeholder:text-[#9C9590] focus:bg-white focus:ring-2 focus:ring-[#1A1714]/10 focus:border-[#1A1714]"
                        maxLength={MAX_CUSTOM_LEN}
                        rows={3}
                      />
                      <p style={{ fontSize: 11, color: 'var(--warm-ink-tertiary, #9C9590)', textAlign: 'right', marginTop: 4 }}>
                        {MAX_CUSTOM_LEN - customInstructions.length} characters left
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              ) : (
              <div style={{
                width: '100%',
                borderRadius: 12,
                border: '1px solid var(--warm-border, #E8E4DE)',
                background: 'var(--warm-surface, #FAFBFF)',
                padding: '16px 20px',
                marginBottom: 28,
                opacity: 0.6,
                cursor: 'default',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <LockKeyhole style={{ width: 14, height: 14, color: 'var(--warm-ink-tertiary, #9C9590)' }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--warm-ink-tertiary, #9C9590)' }}>Create Your Own Template</span>
                  <span style={{ fontSize: 11, color: 'var(--warm-ink-tertiary, #9C9590)' }}>Elite · Free trial available</span>
                </div>
              </div>
              )}

              {/* Sign-off & signature - always visible */}
              <div style={{ marginBottom: 28 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#3B3530', display: 'block', marginBottom: 8 }}>Sign-off & signature</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {["Best,", "Thanks,", "Warm regards,", "Sincerely,", "Cheers,"].map((preset) => {
                    const isActive = signoffPhrase === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setSignoffPhrase(preset);
                          setSignoffPhraseCustom("");
                        }}
                        style={{
                          padding: '6px 14px',
                          fontSize: 12,
                          fontWeight: 500,
                          borderRadius: 8,
                          border: isActive ? '1.5px solid #1A1714' : '1px solid var(--warm-border, #E8E4DE)',
                          background: isActive ? '#1A1714' : 'var(--warm-surface, #FAFBFF)',
                          color: isActive ? '#fff' : '#3B3530',
                          cursor: 'pointer',
                          transition: 'all .15s',
                          fontFamily: 'inherit',
                        }}
                      >
                        {preset}
                      </button>
                    );
                  })}
                  {(() => {
                    const isActive = signoffPhrase === "custom";
                    return (
                      <button
                        type="button"
                        onClick={() => setSignoffPhrase("custom")}
                        style={{
                          padding: '6px 14px',
                          fontSize: 12,
                          fontWeight: 500,
                          borderRadius: 8,
                          border: isActive ? '1.5px solid #1A1714' : '1px solid var(--warm-border, #E8E4DE)',
                          background: isActive ? '#1A1714' : 'var(--warm-surface, #FAFBFF)',
                          color: isActive ? '#fff' : '#3B3530',
                          cursor: 'pointer',
                          transition: 'all .15s',
                          fontFamily: 'inherit',
                        }}
                      >
                        Custom
                      </button>
                    );
                  })()}
                  {signoffPhrase === "custom" && (
                    <Input
                      placeholder="e.g. Best regards,"
                      value={signoffPhraseCustom}
                      onChange={(e) => setSignoffPhraseCustom(e.target.value.slice(0, 50))}
                      className="inline-flex w-[160px] h-8 text-xs rounded-lg border-[#E8E4DE]"
                      maxLength={50}
                    />
                  )}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#3B3530', display: 'block', marginBottom: 6 }}>Signature block (name, university, email, LinkedIn…)</label>
                  <Textarea
                    placeholder="e.g. John Smith\nUSC | Class of 2025\njohn@example.com"
                    value={signatureBlock}
                    onChange={(e) => setSignatureBlock(e.target.value.slice(0, 500))}
                    className="min-h-[72px] resize-y w-full rounded-lg border-[#E8E4DE] bg-[#FAF9F6] text-sm text-[#1A1714] placeholder:text-[#9C9590] focus:bg-white focus:ring-2 focus:ring-[#1A1714]/10 focus:border-[#1A1714]"
                    maxLength={500}
                    rows={3}
                  />
                  <p style={{ fontSize: 11, color: 'var(--warm-ink-tertiary, #9C9590)', textAlign: 'right', marginTop: 4 }}>{500 - signatureBlock.length} characters left</p>
                </div>
                <p style={{ fontSize: 11, color: 'var(--warm-ink-tertiary, #9C9590)', marginTop: 4 }}>Live preview:</p>
                <pre style={{ fontSize: 12, color: '#3B3530', marginTop: 2, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                  {`${effectiveSignoff}\n${signatureBlock.trim() || firstName}`}
                </pre>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{ fontSize: 13, color: 'var(--warm-ink-tertiary, #9C9590)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleApplyToSearch}
                  disabled={isSaving}
                  style={{
                    padding: '9px 18px',
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 8,
                    border: '1.5px solid var(--warm-border, #E8E4DE)',
                    background: 'transparent',
                    color: '#3B3530',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all .15s',
                  }}
                >
                  Apply to this search
                </button>
                <button
                  type="button"
                  onClick={handleSaveAsDefault}
                  disabled={isSaving}
                  style={{
                    padding: '9px 18px',
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: '1.5px solid transparent',
                    background: '#1A1714',
                    color: '#fff',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all .15s',
                  }}
                >
                  {isSaving ? "Saving…" : isMakeYourOwn ? "Save Template" : "Save as default"}
                </button>
              </div>

              {/* Preview */}
              <div style={{
                borderLeft: '3px solid var(--warm-border, #E8E4DE)',
                background: 'var(--warm-surface, #FAFBFF)',
                borderRadius: '0 12px 12px 0',
                padding: '16px 20px',
              }}>
                <p style={{ fontSize: 10, fontWeight: 500, color: 'var(--warm-ink-tertiary, #9C9590)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Preview</p>
                {isMakeYourOwn ? (
                  <p style={{ fontSize: 13, color: '#3B3530', lineHeight: 1.5 }}>
                    Your emails will be generated based on your instructions above. Each email will be personalized to the contact.
                  </p>
                ) : previewBody ? (
                  <>
                    <p style={{ fontSize: 11, color: 'var(--warm-ink-tertiary, #9C9590)', marginBottom: 12 }}>Actual emails will be personalized to each contact.</p>
                    <pre style={{ fontSize: 13, color: '#3B3530', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.6 }}>
                      {previewBody}
                    </pre>
                  </>
                ) : null}
              </div>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
