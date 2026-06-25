// Agent settings slide-over — opens from gear icon on dashboard.

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAgentLifecycle } from "@/hooks/useAgent";
import type { AgentConfig } from "@/services/agent";
import { firebaseApi } from "@/services/firebaseApi";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

// Mirror of backend CREDIT_COSTS.loop_contact_draft in app/services/loop_budget.py.
// Inflated 2026-06-10 — see lib/constants.ts CREDIT_COSTS.
// Keep in sync with AgentSetupInline.tsx and LoopActivityFeed.tsx.
const CREDIT_COST_PER_CONTACT = 18;

// Keep in sync with AgentSetupInline.tsx — small list, low drift risk.
const INDUSTRY_OPTIONS = [
  "Investment Banking",
  "Consulting",
  "Technology",
  "Private Equity",
  "Venture Capital",
  "Asset Management",
  "Corporate Finance",
  "Marketing",
  "Data Science",
];

export function AgentSettingsModal({
  open,
  onOpenChange,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AgentConfig;
}) {
  const lifecycle = useAgentLifecycle();
  const { user } = useFirebaseAuth();
  const [university, setUniversity] = useState<string | null>(null);
  const hasUniversity = !!(university && university.trim());

  useEffect(() => {
    if (!open || !user?.uid) return;
    firebaseApi
      .getUserOnboardingData(user.uid)
      .then((d) => setUniversity(d.university || ""))
      .catch(() => setUniversity(""));
  }, [open, user?.uid]);

  const snapshot = (c: AgentConfig) => ({
    targetCompanies: c.targetCompanies ?? [],
    targetIndustries: c.targetIndustries ?? [],
    targetRoles: c.targetRoles ?? [],
    targetLocations: c.targetLocations ?? [],
    preferAlumni: c.preferAlumni ?? false,
    weeklyContactTarget: c.weeklyContactTarget,
    creditBudgetPerWeek: c.creditBudgetPerWeek,
    approvalMode: c.approvalMode,
    followUpEnabled: c.followUpEnabled,
    followUpDays: c.followUpDays,
    maxFollowUps: c.maxFollowUps,
    enableJobDiscovery: c.enableJobDiscovery ?? true,
    enableHiringManagers: c.enableHiringManagers ?? true,
    enableCompanyDiscovery: c.enableCompanyDiscovery ?? true,
    digestEnabled: c.digestEnabled ?? true,
  });

  const [local, setLocal] = useState(() => snapshot(config));
  const [baseline, setBaseline] = useState(() => snapshot(config));

  // Re-baseline whenever the modal opens — captures the latest config and
  // discards any prior unsaved edits.
  useEffect(() => {
    if (open) {
      const fresh = snapshot(config);
      setLocal(fresh);
      setBaseline(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Dirty = any field changed against the baseline. Arrays compared by content.
  const isDirty = (() => {
    const keys = Object.keys(local) as Array<keyof typeof local>;
    for (const k of keys) {
      const a = local[k];
      const b = baseline[k];
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length || a.some((v, i) => v !== b[i])) return true;
      } else if (a !== b) {
        return true;
      }
    }
    return false;
  })();

  // Guard: the agent has nothing to do if every discovery channel is off.
  // We block Save (rather than silently letting cycles burn time finding zero
  // contacts) and surface an inline warning so the user can re-enable one.
  const allDiscoveryOff =
    !local.enableJobDiscovery &&
    !local.enableHiringManagers &&
    !local.enableCompanyDiscovery;

  // Guard: a weekly contact target costs ~18 credits per contact. If the
  // budget can't cover the target, the agent stops mid-week. Block Save.
  const estimatedWeeklyCredits =
    local.weeklyContactTarget * CREDIT_COST_PER_CONTACT;
  const budgetUnderfunded = local.creditBudgetPerWeek < estimatedWeeklyCredits;

  const updateList = (
    key: "targetCompanies" | "targetIndustries" | "targetRoles" | "targetLocations",
    next: string[]
  ) => {
    setLocal((p) => ({ ...p, [key]: next }));
  };

  const handleSave = () => {
    lifecycle.updateConfig.mutate(local, {
      onSuccess: () => setBaseline(local),
    });
  };

  const handleDiscard = () => {
    setLocal(baseline);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Agent Settings
            {isDirty && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-600"
                aria-label="Unsaved changes"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Unsaved
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Targets — what the agent is looking for */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Targets</h3>
            <p className="text-xs text-muted-foreground -mt-1">
              The agent only considers companies, industries, and roles you list here.
            </p>
            <TagsField
              label="Target companies"
              list={local.targetCompanies}
              placeholder="e.g. Stripe, Linear"
              onChange={(v) => updateList("targetCompanies", v)}
            />
            <IndustryField
              list={local.targetIndustries}
              onChange={(v) => updateList("targetIndustries", v)}
            />
            <TagsField
              label="Target roles"
              list={local.targetRoles}
              placeholder="e.g. Analyst, Product Designer"
              onChange={(v) => updateList("targetRoles", v)}
            />
            <TagsField
              label="Target locations"
              list={local.targetLocations}
              placeholder="e.g. New York, Remote"
              onChange={(v) => updateList("targetLocations", v)}
            />
            <div className="flex items-center justify-between pt-1">
              <div>
                <Label className="text-sm">Prefer alumni</Label>
                <p className="text-xs text-muted-foreground">
                  {hasUniversity
                    ? "Boost contacts from your university."
                    : "Set your university in Account Settings to use this."}
                </p>
              </div>
              <Switch
                checked={hasUniversity && local.preferAlumni}
                disabled={!hasUniversity}
                onCheckedChange={(v) => setLocal((p) => ({ ...p, preferAlumni: v }))}
              />
            </div>
          </div>

          {/* Volume */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Volume</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Weekly contact target
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={15}
                  step={1}
                  value={local.weeklyContactTarget}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(15, Math.round(Number(e.target.value) || 1)));
                    setLocal((p) => ({ ...p, weeklyContactTarget: n }));
                  }}
                  className="h-7 w-16 text-sm text-right"
                />
              </div>
              <Slider
                min={1}
                max={15}
                step={1}
                value={[local.weeklyContactTarget]}
                onValueChange={([v]) => setLocal((p) => ({ ...p, weeklyContactTarget: v }))}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  Credit budget/week
                </Label>
                <Input
                  type="number"
                  min={10}
                  max={150}
                  step={1}
                  value={local.creditBudgetPerWeek}
                  onChange={(e) => {
                    const n = Math.max(10, Math.min(150, Math.round(Number(e.target.value) || 10)));
                    setLocal((p) => ({ ...p, creditBudgetPerWeek: n }));
                  }}
                  className="h-7 w-16 text-sm text-right"
                />
              </div>
              <Slider
                min={10}
                max={150}
                step={10}
                value={[local.creditBudgetPerWeek]}
                onValueChange={([v]) => setLocal((p) => ({ ...p, creditBudgetPerWeek: v }))}
              />
              <p
                className="text-xs"
                style={{ color: budgetUnderfunded ? "#b91c1c" : undefined }}
              >
                {budgetUnderfunded
                  ? `Budget too low: ${local.weeklyContactTarget} contacts/week needs ~${estimatedWeeklyCredits} credits.`
                  : `${local.weeklyContactTarget} contacts/week ≈ ${estimatedWeeklyCredits} credits (each costs ${CREDIT_COST_PER_CONTACT}).`}
              </p>
            </div>
          </div>

          {/* Features */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Features</h3>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Job discovery</Label>
              <Switch
                checked={local.enableJobDiscovery}
                onCheckedChange={(v) => setLocal((p) => ({ ...p, enableJobDiscovery: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Hiring manager outreach</Label>
              <Switch
                checked={local.enableHiringManagers}
                onCheckedChange={(v) => setLocal((p) => ({ ...p, enableHiringManagers: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Company discovery</Label>
              <Switch
                checked={local.enableCompanyDiscovery}
                onCheckedChange={(v) => setLocal((p) => ({ ...p, enableCompanyDiscovery: v }))}
              />
            </div>
            {allDiscoveryOff && (
              <p className="text-xs text-red-600 pt-1">
                Turn on at least one discovery feature — otherwise your agent
                will run cycles but find nothing.
              </p>
            )}
          </div>

          {/* Control */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Control</h3>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="text-sm">Autopilot</Label>
                <p className="text-xs text-muted-foreground">
                  {local.approvalMode === "autopilot"
                    ? "Agent acts automatically within your budget."
                    : "Agent drafts everything; nothing happens until you approve."}
                </p>
              </div>
              <Switch
                checked={local.approvalMode === "autopilot"}
                onCheckedChange={(v) =>
                  setLocal((p) => ({ ...p, approvalMode: v ? "autopilot" : "review_first" }))
                }
              />
            </div>
          </div>

          {/* Follow-ups */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Follow-ups</h3>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Enable follow-ups</Label>
              <Switch
                checked={local.followUpEnabled}
                onCheckedChange={(v) => setLocal((p) => ({ ...p, followUpEnabled: v }))}
              />
            </div>
            {local.followUpEnabled && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Follow up after {local.followUpDays} days
                  </Label>
                  <Slider
                    min={3}
                    max={14}
                    step={1}
                    value={[local.followUpDays]}
                    onValueChange={([v]) => setLocal((p) => ({ ...p, followUpDays: v }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Max follow-ups per contact: {local.maxFollowUps}
                  </Label>
                  <Slider
                    min={1}
                    max={3}
                    step={1}
                    value={[local.maxFollowUps]}
                    onValueChange={([v]) => setLocal((p) => ({ ...p, maxFollowUps: v }))}
                  />
                </div>
              </>
            )}
          </div>

          {/* Notifications */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Notifications</h3>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label className="text-sm">Daily email summary</Label>
                <p className="text-xs text-muted-foreground">
                  Sends a daily Gmail digest of what your agent found in the last 24 hours.
                </p>
              </div>
              <Switch
                checked={local.digestEnabled}
                onCheckedChange={(v) => setLocal((p) => ({ ...p, digestEnabled: v }))}
              />
            </div>
          </div>

          {/* Danger zone */}
          <div className="space-y-3 pt-4 border-t">
            <h3 className="text-sm font-medium text-red-600">Danger Zone</h3>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  disabled={lifecycle.stop.isPending}
                >
                  Stop Agent
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Stop your agent?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The agent will stop running cycles and your weekly queue will resume.
                    Drafts and contacts you've already saved won't be affected. You can
                    redeploy any time from the setup wizard.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep running</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      lifecycle.stop.mutate();
                      onOpenChange(false);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Stop agent
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Sticky footer — only saves when there are pending edits */}
        <div
          className="sticky bottom-0 left-0 right-0 -mx-6 mt-6 px-6 py-3 border-t bg-background flex items-center justify-between gap-2"
          style={{ marginBottom: "-1.5rem" }}
        >
          <span className="text-xs text-muted-foreground">
            {isDirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDiscard}
              disabled={!isDirty || lifecycle.updateConfig.isPending}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={
                !isDirty ||
                allDiscoveryOff ||
                budgetUnderfunded ||
                lifecycle.updateConfig.isPending
              }
            >
              {lifecycle.updateConfig.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Tag input helpers ──────────────────────────────────────────────────────

function TagPills({
  list,
  onRemove,
}: {
  list: string[];
  onRemove: (t: string) => void;
}) {
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-xs bg-muted border"
        >
          {t}
          <button
            type="button"
            onClick={() => onRemove(t)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center"
            aria-label={`Remove ${t}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

function TagsField({
  label,
  list,
  onChange,
  placeholder,
}: {
  label: string;
  list: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [val, setVal] = useState("");
  const add = () => {
    const t = val.trim();
    if (t && !list.some((x) => x.toLowerCase() === t.toLowerCase())) {
      onChange([...list, t]);
    }
    setVal("");
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <TagPills list={list} onRemove={(t) => onChange(list.filter((x) => x !== t))} />
      <div className="flex gap-2">
        <Input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={add}
          disabled={!val.trim()}
          className="h-8"
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function IndustryField({
  list,
  onChange,
}: {
  list: string[];
  onChange: (next: string[]) => void;
}) {
  const remaining = INDUSTRY_OPTIONS.filter((i) => !list.includes(i));
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Target industries</Label>
      <TagPills list={list} onRemove={(t) => onChange(list.filter((x) => x !== t))} />
      <Select
        value=""
        onValueChange={(v) => {
          if (v && !list.includes(v)) onChange([...list, v]);
        }}
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder={list.length ? "Add another industry…" : "Pick an industry…"} />
        </SelectTrigger>
        <SelectContent>
          {remaining.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">All industries added.</div>
          ) : (
            remaining.map((i) => (
              <SelectItem key={i} value={i}>
                {i}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
