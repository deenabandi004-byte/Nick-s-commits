// Inline agent setup wizard - 3-step flow with editorial headlines,
// step rail, tag inputs, and a live preview rail sidebar.

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateAgentConfig, deployAgent } from "@/services/agent";

// ── Constants ──────────────────────────────────────────────────────────

const STEPS = [
  { id: "goals", num: "01", label: "Goals", sub: "Who and where" },
  { id: "volume", num: "02", label: "Cadence", sub: "Pace and budget" },
  { id: "review", num: "03", label: "Review", sub: "Deploy" },
] as const;

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

const COMPANY_SUGGESTIONS = ["Stripe", "Linear", "Vercel", "Notion", "Ramp", "Arc", "Anthropic"];
const ROLE_SUGGESTIONS = ["Product Designer", "Design Engineer", "Analyst", "Associate", "Software Engineer"];

const KIND_META: Record<string, { color: string; label: string }> = {
  scan:     { color: "#7d8ba6", label: "scan" },
  research: { color: "#7d8ba6", label: "research" },
  match:    { color: "#16a34a", label: "match" },
  draft:    { color: "#d4a017", label: "draft" },
  verify:   { color: "#16a34a", label: "verify" },
  queue:    { color: "#7d8ba6", label: "queue" },
};

function buildPreviewTraces(form: {
  companies: string[];
  industries: string[];
  roles: string[];
  weeklyTarget: number;
}) {
  const co = form.companies[0] || form.industries[0] || "your targets";
  const role = form.roles[0] || "matching roles";
  return [
    { kind: "scan", text: `Scanning the web for ${role} at ${co}` },
    { kind: "research", text: "Reading recent posts to find talking points" },
    { kind: "match", text: `Re-ranking candidates \u00b7 target ${form.weeklyTarget}/week` },
    { kind: "draft", text: "Drafting personalized opener" },
    { kind: "verify", text: "Verifying email deliverability" },
    { kind: "queue", text: "Queuing for your review" },
  ];
}

// ── Primitives ─────────────────────────────────────────────────────────

function MonoTag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="font-mono uppercase"
      style={{ fontSize: 10, letterSpacing: 0.6, fontWeight: 500, color: color || "var(--ink-3)" }}
    >
      {children}
    </span>
  );
}

function PulseDot({ color = "#22c55e" }: { color?: string }) {
  return (
    <span className="relative inline-block w-[7px] h-[7px]">
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: color, animation: "om-pulse 1.6s ease-out infinite" }}
      />
    </span>
  );
}

function ActivityBars() {
  return (
    <span className="inline-flex items-end gap-[2px] h-[10px]">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[2px] h-[10px] rounded-[1px]"
          style={{
            background: "var(--ink-3)",
            animation: `om-bars ${1.2 + i * 0.1}s ease-in-out ${i * 0.13}s infinite`,
            transformOrigin: "bottom",
          }}
        />
      ))}
    </span>
  );
}

// ── Tag Input ──────────────────────────────────────────────────────────
// Chips live inside the input box with numbered mono labels.
// Hover a chip -> strikethrough; click to remove. No x buttons.

function TagChip({
  label,
  index,
  onRemove,
}: {
  label: string;
  index: number;
  onRemove: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      onClick={onRemove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded border font-mono text-[12.5px] cursor-pointer transition-all duration-100"
      style={{
        background: hover ? "transparent" : "var(--paper)",
        borderColor: hover ? "var(--ink-3)" : "var(--line)",
        color: hover ? "var(--ink-3)" : "var(--ink)",
        textDecoration: hover ? "line-through" : "none",
      }}
      title="Click to remove"
    >
      <span className="text-[9.5px] tracking-wide" style={{ color: "var(--ink-3)" }}>
        {String(index + 1).padStart(2, "0")}
      </span>
      {label}
    </span>
  );
}

function SuggestionChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="font-mono text-[12px] px-2.5 py-1 rounded border border-dashed transition-colors duration-100 hover:border-solid hover:bg-paper-2"
      style={{ borderColor: "var(--ink-3)", color: "var(--ink-3)" }}
    >
      + {label}
    </button>
  );
}

function TagInput({
  placeholder,
  list,
  setList,
  suggestions = [],
}: {
  placeholder: string;
  list: string[];
  setList: (v: string[]) => void;
  suggestions?: string[];
}) {
  const [val, setVal] = useState("");
  const [focused, setFocused] = useState(false);

  const add = (v?: string) => {
    const t = (v || val).trim();
    if (t && !list.includes(t)) setList([...list, t]);
    setVal("");
  };
  const rem = (t: string) => setList(list.filter((x) => x !== t));
  const remaining = suggestions.filter((s) => !list.includes(s));

  return (
    <div>
      <div
        className="rounded-[var(--radius)] border bg-elev transition-all duration-100"
        style={{
          borderColor: focused ? "var(--ink)" : "var(--line)",
          boxShadow: focused ? "0 0 0 3px rgba(17,19,24,.06)" : "none",
          padding: list.length > 0 ? "10px 10px 4px 12px" : "4px 12px",
        }}
      >
        {list.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {list.map((t, i) => (
              <TagChip key={t} label={t} index={i} onRemove={() => rem(t)} />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              } else if (e.key === "Backspace" && val === "" && list.length > 0) {
                rem(list[list.length - 1]);
              }
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={list.length === 0 ? placeholder : "and one more\u2026"}
            className="flex-1 border-none p-2 text-sm bg-transparent focus:outline-none placeholder:text-ink-3"
            style={{ color: "var(--ink)" }}
          />
          <span
            className="font-mono text-[9.5px] uppercase tracking-wide shrink-0 transition-opacity"
            style={{ color: "var(--ink-3)", opacity: val ? 1 : 0.5 }}
          >
            {val ? "press \u21b5" : `${list.length} added`}
          </span>
        </div>
      </div>

      {remaining.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
          <MonoTag>suggested</MonoTag>
          {remaining.slice(0, 6).map((s) => (
            <SuggestionChip key={s} label={s} onClick={() => add(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Industry Tag Box ───────────────────────────────────────────────────
// Same chip-inside-box pattern but with a select dropdown instead of text input.

function IndustryInput({
  list,
  setList,
}: {
  list: string[];
  setList: (v: string[]) => void;
}) {
  const rem = (t: string) => setList(list.filter((x) => x !== t));
  const remaining = INDUSTRY_OPTIONS.filter((i) => !list.includes(i));

  return (
    <div
      className="rounded-[var(--radius)] border border-line bg-elev"
      style={{ padding: list.length > 0 ? "10px 10px 4px 12px" : "4px 4px" }}
    >
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {list.map((t, i) => (
            <TagChip key={t} label={t} index={i} onRemove={() => rem(t)} />
          ))}
        </div>
      )}
      <Select
        onValueChange={(v) => {
          if (!list.includes(v)) setList([...list, v]);
        }}
      >
        <SelectTrigger className="border-0 shadow-none focus:ring-0 h-9 text-sm">
          <SelectValue
            placeholder={list.length ? "and another industry\u2026" : "Pick an industry\u2026"}
          />
        </SelectTrigger>
        <SelectContent>
          {remaining.map((i) => (
            <SelectItem key={i} value={i}>
              {i}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Field wrapper ──────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      <div className="flex items-baseline gap-2.5 mb-2">
        <Label className="font-mono text-[10px] font-medium tracking-wider uppercase" style={{ color: "var(--ink-3)" }}>
          {label}
        </Label>
        {hint && (
          <span className="text-xs italic" style={{ color: "var(--ink-3)" }}>
             -  {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Mode card (radio) ──────────────────────────────────────────────────

function ModeCard({
  active,
  title,
  desc,
  tag,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  tag?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left p-3.5 rounded-lg border transition-colors cursor-pointer"
      style={{
        borderColor: active ? "var(--brand)" : "var(--line)",
        background: active ? "var(--paper-2)" : "var(--paper)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="w-2.5 h-2.5 rounded-full border-2"
          style={{
            borderColor: active ? "var(--brand)" : "var(--ink-3)",
            borderWidth: active ? 3 : 1.5,
            background: active ? "var(--paper)" : "transparent",
          }}
        />
        <span className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
          {title}
        </span>
        {tag && (
          <span className="ml-auto">
            <MonoTag>{tag}</MonoTag>
          </span>
        )}
      </div>
      <div className="text-xs leading-relaxed pl-[18px]" style={{ color: "var(--ink-2)" }}>
        {desc}
      </div>
    </button>
  );
}

// ── Step rail ──────────────────────────────────────────────────────────

function StepRail({
  index,
  onJump,
}: {
  index: number;
  onJump: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 border-y border-line" style={{ background: "var(--paper-2)" }}>
      {STEPS.map((s, i) => {
        const active = i === index;
        const done = i < index;
        return (
          <button
            key={s.id}
            onClick={() => onJump(i)}
            className="relative text-left py-3.5 px-4 cursor-pointer border-0"
            style={{
              background: active ? "var(--paper)" : "transparent",
              borderRight: i < STEPS.length - 1 ? "1px solid var(--line)" : "none",
            }}
          >
            {active && (
              <span className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: "var(--brand)" }} />
            )}
            <div className="flex items-center gap-2.5">
              <span
                className="font-mono text-[11px] font-medium tracking-wide"
                style={{
                  color: done ? "var(--signal-pos)" : active ? "var(--ink)" : "var(--ink-3)",
                }}
              >
                {done ? "\u2713" : s.num}
              </span>
              <div>
                <div
                  className="text-[13px]"
                  style={{
                    fontWeight: active ? 600 : 500,
                    color: active ? "var(--ink)" : done ? "var(--ink-2)" : "var(--ink-3)",
                  }}
                >
                  {s.label}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--ink-3)" }}>
                  {s.sub}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Preview rail (right sidebar) ───────────────────────────────────────

function PreviewRail({ form }: { form: FormState }) {
  const traces = useMemo(() => buildPreviewTraces(form), [form]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1500);
    return () => clearInterval(id);
  }, []);

  const visible = traces.slice(0, (tick % traces.length) + 1);

  return (
    <aside
      className="w-[300px] shrink-0 border-l border-line flex-col gap-4 hidden lg:flex"
      style={{ background: "var(--paper-2)", padding: "28px 20px" }}
    >
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <PulseDot color="#d4a017" />
          <MonoTag color="var(--signal-wait)">preview &middot; not running</MonoTag>
        </div>
        <p className="text-lg font-medium leading-tight" style={{ color: "var(--ink)" }}>
          What your agent <em className="font-medium">will do</em> once deployed.
        </p>
      </div>

      <div className="border border-line rounded-[10px] bg-paper relative overflow-hidden">
        <span
          className="absolute left-0 right-0 top-0 h-[1.5px]"
          style={{
            background: "linear-gradient(90deg, transparent, var(--brand), transparent)",
            animation: "om-scan 2.4s ease-in-out infinite",
          }}
        />
        <div className="px-3.5 py-2.5 border-b border-line-2 flex items-center justify-between">
          <MonoTag>simulated trace</MonoTag>
          <ActivityBars />
        </div>
        {traces.map((t, i) => {
          const meta = KIND_META[t.kind];
          const on = i < visible.length;
          return (
            <div
              key={i}
              className="px-3.5 py-2.5 transition-opacity duration-200"
              style={{
                borderBottom: i < traces.length - 1 ? "1px solid var(--line-2)" : "none",
                opacity: on ? 1 : 0.35,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="w-[5px] h-[5px] rounded-full"
                  style={{ background: meta.color }}
                />
                <MonoTag color={meta.color}>{meta.label}</MonoTag>
              </div>
              <div className="text-xs leading-relaxed pl-[13px]" style={{ color: "var(--ink-2)" }}>
                {t.text}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line pt-3.5 mt-auto text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
        Nothing sends without your approval. You can pause the agent any time from the Agent Mode dashboard.
      </div>
    </aside>
  );
}

// ── Step bodies ────────────────────────────────────────────────────────

interface FormState {
  companies: string[];
  industries: string[];
  roles: string[];
  preferAlumni: boolean;
  weeklyTarget: number;
  creditBudget: number;
  approvalMode: "review_first" | "autopilot";
}

function StepGoals({
  form,
  set,
}: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
}) {
  return (
    <div>
      <Field label="Target companies" hint="Press Enter to add">
        <TagInput
          placeholder="e.g. Stripe, Linear, Vercel"
          list={form.companies}
          setList={(v) => set({ companies: v })}
          suggestions={COMPANY_SUGGESTIONS}
        />
      </Field>

      <Field label="Target industries">
        <IndustryInput
          list={form.industries}
          setList={(v) => set({ industries: v })}
        />
      </Field>

      <Field label="Target roles" hint="Press Enter to add">
        <TagInput
          placeholder="e.g. Product Designer, Analyst"
          list={form.roles}
          setList={(v) => set({ roles: v })}
          suggestions={ROLE_SUGGESTIONS}
        />
      </Field>

      <div className="flex items-center justify-between pt-3.5 border-t border-line-2">
        <div>
          <div className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
            Prefer alumni
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--ink-3)" }}>
            Boost contacts from your university.
          </div>
        </div>
        <Switch checked={form.preferAlumni} onCheckedChange={(v) => set({ preferAlumni: v })} />
      </div>
    </div>
  );
}

function StepCadence({
  form,
  set,
}: {
  form: FormState;
  set: (patch: Partial<FormState>) => void;
}) {
  return (
    <div>
      <Field label="Weekly contact target" hint="How many new contacts per week">
        <div className="flex items-baseline gap-2 mb-2.5">
          <span className="text-[28px] font-medium leading-none" style={{ color: "var(--ink)" }}>
            {form.weeklyTarget}
          </span>
          <span className="text-xs" style={{ color: "var(--ink-3)" }}>
            contacts / week
          </span>
        </div>
        <Slider
          min={1}
          max={15}
          step={1}
          value={[form.weeklyTarget]}
          onValueChange={([v]) => set({ weeklyTarget: v })}
        />
        <div className="flex justify-between mt-1.5 font-mono text-[10.5px]" style={{ color: "var(--ink-3)" }}>
          <span>1</span>
          <span>15</span>
        </div>
      </Field>

      <Field label="Credit budget" hint="Max credits the agent can spend per week">
        <div className="flex items-baseline gap-2 mb-2.5">
          <span className="text-[28px] font-medium leading-none" style={{ color: "var(--ink)" }}>
            {form.creditBudget}
          </span>
          <span className="text-xs" style={{ color: "var(--ink-3)" }}>
            credits / week
          </span>
        </div>
        <Slider
          min={10}
          max={150}
          step={10}
          value={[form.creditBudget]}
          onValueChange={([v]) => set({ creditBudget: v })}
        />
        <div className="flex justify-between mt-1.5 font-mono text-[10.5px]" style={{ color: "var(--ink-3)" }}>
          <span>10</span>
          <span>150</span>
        </div>
      </Field>

      <Field label="Approval mode">
        <div className="grid grid-cols-2 gap-2.5">
          <ModeCard
            active={form.approvalMode === "review_first"}
            title="Review first"
            tag="recommended"
            desc="Agent drafts everything; nothing sends until you approve."
            onClick={() => set({ approvalMode: "review_first" })}
          />
          <ModeCard
            active={form.approvalMode === "autopilot"}
            title="Autopilot"
            desc="Agent sends approved templates automatically within your budget."
            onClick={() => set({ approvalMode: "autopilot" })}
          />
        </div>
      </Field>
    </div>
  );
}

function StepReview({ form }: { form: FormState }) {
  const rows = [
    { k: "Companies", v: form.companies.length ? form.companies.join(", ") : "\u2014" },
    { k: "Industries", v: form.industries.length ? form.industries.join(", ") : "\u2014" },
    { k: "Roles", v: form.roles.length ? form.roles.join(", ") : "\u2014" },
    { k: "Weekly target", v: `${form.weeklyTarget} contacts / week` },
    { k: "Credit budget", v: `${form.creditBudget} credits / week` },
    { k: "Approval mode", v: form.approvalMode === "review_first" ? "Review first" : "Autopilot" },
    { k: "Alumni priority", v: form.preferAlumni ? "On" : "Off" },
  ];

  return (
    <div>
      <p className="text-lg font-medium leading-tight mb-1" style={{ color: "var(--ink)" }}>
        Ready to deploy your <em className="font-medium">agent.</em>
      </p>
      <p className="text-[13px] mb-5" style={{ color: "var(--ink-2)" }}>
        Once deployed, it will start a discovery cycle within 60 seconds.
      </p>

      <div className="border border-line rounded-[10px] overflow-hidden bg-paper mb-4">
        {rows.map((r, i) => (
          <div
            key={r.k}
            className="grid grid-cols-[140px_1fr] px-4 py-2.5 text-[12.5px]"
            style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--line-2)" : "none" }}
          >
            <span style={{ color: "var(--ink-3)" }}>{r.k}</span>
            <span className="font-medium" style={{ color: "var(--ink)" }}>
              {r.v}
            </span>
          </div>
        ))}
      </div>

      <div
        className="rounded-[10px] border border-line p-3.5 flex gap-3 items-start"
        style={{ background: "var(--paper-2)" }}
      >
        <span
          className="w-7 h-7 rounded-lg shrink-0 inline-flex items-center justify-center text-white text-[13px] font-semibold"
          style={{ background: "linear-gradient(135deg, #f5b945, #e08a2a)" }}
        >
          S
        </span>
        <div>
          <div className="text-[13px] font-semibold mb-0.5" style={{ color: "var(--ink)" }}>
            Scout will find contacts, watch for replies, and draft outreach.
          </div>
          <div className="text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
            You'll see new drafts in the Agent Mode dashboard. Pause or reconfigure any time  - 
            your settings save automatically.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export function AgentSetupInline({ onDeployed }: { onDeployed: () => void }) {
  const { toast } = useToast();
  const [stepIdx, setStepIdx] = useState(0);
  const [deploying, setDeploying] = useState(false);

  const [form, setForm] = useState<FormState>(() => {
    const base: FormState = {
      companies: [],
      industries: [],
      roles: [],
      preferAlumni: true,
      weeklyTarget: 5,
      creditBudget: 100,
      approvalMode: "review_first",
    };
    // Pre-fill from a Home-page "start a loop" card.
    try {
      const raw = sessionStorage.getItem("loop_prefill");
      if (raw) {
        sessionStorage.removeItem("loop_prefill");
        const p = JSON.parse(raw);
        return {
          ...base,
          companies: Array.isArray(p.companies) ? p.companies.slice(0, 8) : [],
          industries: Array.isArray(p.industries) ? p.industries.slice(0, 8) : [],
          roles: Array.isArray(p.roles) ? p.roles.slice(0, 8) : [],
        };
      }
    } catch { /* ignore */ }
    return base;
  });
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;
  const canDeploy = form.companies.length > 0 || form.industries.length > 0;

  const handleDeploy = async () => {
    if (!canDeploy) {
      toast({
        title: "Add targets",
        description: "Add at least one target company or industry.",
        variant: "destructive",
      });
      return;
    }
    setDeploying(true);
    try {
      await updateAgentConfig({
        targetCompanies: form.companies,
        targetIndustries: form.industries,
        targetRoles: form.roles,
        targetLocations: [],
        preferAlumni: form.preferAlumni,
        weeklyContactTarget: form.weeklyTarget,
        creditBudgetPerWeek: form.creditBudget,
        approvalMode: form.approvalMode,
        sendMode: "drafts_only",
      });
      await deployAgent();
      toast({ title: "Agent deployed!", description: "Your networking agent is now active." });
      onDeployed();
    } catch (e: unknown) {
      toast({
        title: "Deploy failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="flex min-h-0">
      {/* Main form column */}
      <div className="flex-1 min-w-0">
        <div className="max-w-[640px] mx-auto px-4 sm:px-8 py-8 pb-20">
          {/* Hero */}
          <div className="mb-7">
            <MonoTag>&middot; step {step.num}</MonoTag>
            <h1 className="mt-2.5 mb-2 text-[28px] sm:text-[34px] font-medium leading-tight tracking-tight">
              {stepIdx === 0 && (
                <>
                  Tell Scout <em className="font-medium">who</em> to chase.
                </>
              )}
              {stepIdx === 1 && (
                <>
                  Set the <em className="font-medium">pace</em> and the rules.
                </>
              )}
              {stepIdx === 2 && (
                <>
                  Look it over, then <em className="font-medium">deploy.</em>
                </>
              )}
            </h1>
            <p className="text-[13.5px] max-w-[480px]" style={{ color: "var(--ink-2)" }}>
              {stepIdx === 0 &&
                "The agent will only consider companies, industries, and roles you list here. You can edit anytime."}
              {stepIdx === 1 &&
                "Caps the agent so it doesn't over-reach. We recommend Review First to start."}
              {stepIdx === 2 && "Deploying starts the first discovery cycle right away."}
            </p>
          </div>

          {/* Step rail */}
          <StepRail index={stepIdx} onJump={setStepIdx} />

          {/* Step body */}
          <div className="pt-7">
            {stepIdx === 0 && <StepGoals form={form} set={set} />}
            {stepIdx === 1 && <StepCadence form={form} set={set} />}
            {stepIdx === 2 && <StepReview form={form} />}
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center mt-7 pt-5 border-t border-line-2">
            <Button
              variant="outline"
              onClick={() => stepIdx > 0 && setStepIdx(stepIdx - 1)}
              disabled={stepIdx === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>

            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[11px] tracking-wide" style={{ color: "var(--ink-3)" }}>
                {stepIdx + 1} / {STEPS.length}
              </span>
              {isLast ? (
                <Button
                  onClick={handleDeploy}
                  disabled={!canDeploy || deploying}
                  className="bg-brand hover:bg-brand-2"
                >
                  {deploying ? (
                    <>
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-white"
                        style={{ animation: "om-blink 1s ease-in-out infinite" }}
                      />
                      Deploying...
                    </>
                  ) : (
                    <>Deploy agent &rarr;</>
                  )}
                </Button>
              ) : (
                <Button onClick={() => setStepIdx(stepIdx + 1)} className="bg-brand hover:bg-brand-2">
                  Continue &rarr;
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview rail */}
      <PreviewRail form={form} />
    </div>
  );
}
