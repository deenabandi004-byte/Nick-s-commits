// DashboardPage - "Getting Started"
// The post-login landing. One job: hand the user off into a search.
//
// User-facing name is "Getting Started"; the route stays /dashboard (see
// docs/getting-started-route-note.md for why the label and route differ).
//
// This is a launcher, nothing else runs here. The user picks a mode
// (People or Companies), types a natural-language query, and we navigate to
// /find with the mode and query in the URL. The Find page owns the actual
// search, filters, batch size, and results.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronDown, Users, Building2, Loader2 } from "lucide-react";

import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { MainContentWrapper } from "@/components/MainContentWrapper";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

type FindMode = "people" | "companies";

const MODES: { id: FindMode; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }[] = [
  { id: "people", label: "People", icon: Users },
  { id: "companies", label: "Companies", icon: Building2 },
];

// Placeholder + example prompts per mode. Examples prefill the box on click so
// a first-time user can see the shape of a good query.
const MODE_COPY: Record<FindMode, { placeholder: string; examples: string[] }> = {
  people: {
    placeholder: "Product managers at Google in New York",
    examples: [
      "Investment banking analysts at Goldman Sachs",
      "USC alumni in consulting at McKinsey",
    ],
  },
  companies: {
    placeholder: "SaaS companies in Boston hiring interns",
    examples: [
      "Boutique investment banks in New York",
      "Series B fintech startups in San Francisco",
    ],
  },
};

function firstNameOf(name?: string): string {
  const n = (name || "").trim().split(/\s+/)[0];
  return n || "there";
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useFirebaseAuth();

  const [mode, setMode] = useState<FindMode>("people");
  const [query, setQuery] = useState("");
  const [modeOpen, setModeOpen] = useState(false);

  const copy = MODE_COPY[mode];
  const activeMode = useMemo(() => MODES.find((m) => m.id === mode)!, [mode]);

  // Hand the query off to the Find page. The Find page reads `tab` and `q` from
  // the URL and runs the search there. An empty query just opens the tab.
  const launch = (q: string = query) => {
    const trimmed = q.trim();
    const params = new URLSearchParams({ tab: mode });
    if (trimmed) params.set("q", trimmed);
    navigate(`/find?${params.toString()}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      launch();
    }
  };

  /* ---- auth gate ---- */
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--brand-blue)" }} />
      </div>
    );
  }

  const ActiveIcon = activeMode.icon;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full font-sans" style={{ color: "var(--brand-ink)" }}>
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="Getting Started" />

          <div className="flex-1 overflow-y-auto relative" style={{ background: "#FBFCFE" }}>
            {/* Brand watercolor backdrop, fixed to the viewport bottom so the
                horizon stays visible regardless of scroll. Kept from the prior
                home for brand continuity. */}
            <img
              src="/mountains-lake.png"
              alt=""
              aria-hidden
              draggable={false}
              style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                width: "100%",
                height: "70vh",
                objectFit: "cover",
                objectPosition: "bottom center",
                opacity: 0.9,
                zIndex: 0,
                pointerEvents: "none",
                userSelect: "none",
              }}
            />

            <div
              className="relative mx-auto flex w-full max-w-[720px] flex-col items-center px-5"
              style={{ zIndex: 1, paddingTop: "14vh" }}
            >
              {/* Greeting */}
              <p
                className="mb-2 text-sm font-medium"
                style={{ color: "var(--brand-ink-secondary)" }}
              >
                Hi {firstNameOf(user?.name)}
              </p>

              {/* Heading + mode selector */}
              <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
                <h1
                  className="text-3xl sm:text-4xl"
                  style={{ fontFamily: "var(--font-display, 'Instrument Serif', Georgia, serif)", fontWeight: 400 }}
                >
                  Help me find
                </h1>

                <Popover open={modeOpen} onOpenChange={setModeOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className="flex items-center gap-2 rounded-st-2xl border bg-white px-4 py-2 text-lg transition-colors"
                      style={{
                        borderColor: "var(--brand-border)",
                        color: "var(--brand-ink)",
                        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                      }}
                    >
                      <ActiveIcon className="h-4 w-4" />
                      <span className="font-medium">{activeMode.label}</span>
                      <ChevronDown className="h-4 w-4" style={{ color: "var(--brand-ink-tertiary)" }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-48 p-1.5">
                    {MODES.map((m) => {
                      const Icon = m.icon;
                      const selected = m.id === mode;
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            setMode(m.id);
                            setModeOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-st-xl px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--brand-blue-subtle)]"
                          style={{
                            color: "var(--brand-ink)",
                            background: selected ? "var(--brand-blue-soft)" : "transparent",
                            fontWeight: selected ? 600 : 500,
                          }}
                        >
                          <Icon className="h-4 w-4" style={{ color: "var(--brand-blue)" }} />
                          {m.label}
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Search box */}
              <div
                className="flex w-full items-center gap-2 rounded-st-3xl border bg-white p-2 pl-5"
                style={{
                  borderColor: "var(--brand-border)",
                  boxShadow: "0 4px 20px rgba(15,23,42,0.06)",
                }}
              >
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={copy.placeholder}
                  aria-label={`Search ${activeMode.label.toLowerCase()}`}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-[var(--brand-ink-tertiary)]"
                  style={{ color: "var(--brand-ink)" }}
                  autoFocus
                />
                <button
                  onClick={() => launch()}
                  aria-label="Search"
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-st-2xl transition-colors"
                  style={{ background: "var(--brand-blue)", color: "#FFFFFF" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--brand-blue-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--brand-blue)")}
                >
                  <Search className="h-5 w-5" />
                </button>
              </div>

              {/* Example prompts */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {copy.examples.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => {
                      setQuery(ex);
                      launch(ex);
                    }}
                    className="rounded-st-xl border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--brand-blue-subtle)]"
                    style={{ borderColor: "var(--brand-border)", color: "var(--brand-ink-secondary)" }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
