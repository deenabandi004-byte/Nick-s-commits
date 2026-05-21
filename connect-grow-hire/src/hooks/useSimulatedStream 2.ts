// Simulated terminal-style activity stream for the agent running state.
// Generates log lines from real cycle step progress to make the UI feel alive.

import { useState, useEffect, useRef } from "react";
import type { CycleStep } from "@/hooks/useAgent";

export interface StreamLine {
  id: number;
  text: string;
  type: "info" | "success" | "working" | "dim";
  timestamp: string;
}

const MICRO_ACTIONS: Record<string, string[]> = {
  find: [
    "Querying contact database...",
    "Filtering by company match...",
    "Checking alumni connections...",
    "Verifying email addresses...",
    "Ranking by relevance...",
  ],
  find_jobs: [
    "Scanning job boards...",
    "Matching against your profile...",
    "Extracting requirements...",
    "Scoring role fit...",
  ],
  discover_companies: [
    "Researching target firms...",
    "Pulling company data...",
    "Checking recruiting timelines...",
  ],
  find_hiring_managers: [
    "Identifying decision makers...",
    "Cross-referencing with job posts...",
    "Looking up hiring managers...",
  ],
  draft: [
    "Personalizing email templates...",
    "Generating subject lines...",
    "Drafting outreach messages...",
    "Optimizing for response rate...",
  ],
  follow_up: [
    "Checking reply status...",
    "Scheduling follow-ups...",
    "Adjusting send timing...",
  ],
};

const IDLE_LINES = [
  "Analyzing your target criteria...",
  "Planning next actions...",
  "Optimizing search parameters...",
  "Loading contact graph...",
];

function now(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

let nextId = 0;

export function useSimulatedStream(
  isRunning: boolean,
  currentAction: string | null,
  completedActions: CycleStep[]
) {
  const [lines, setLines] = useState<StreamLine[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActionRef = useRef<string | null>(null);
  const microIndexRef = useRef(0);
  const completedCountRef = useRef(0);

  // Reset on new run
  useEffect(() => {
    if (isRunning) {
      nextId = 0;
      setLines([
        {
          id: nextId++,
          text: "Agent cycle started",
          type: "info",
          timestamp: now(),
        },
      ]);
      completedCountRef.current = 0;
      lastActionRef.current = null;
      microIndexRef.current = 0;
    } else {
      // Cycle ended
      if (lines.length > 0) {
        setLines((prev) => [
          ...prev,
          {
            id: nextId++,
            text: "Cycle complete",
            type: "success",
            timestamp: now(),
          },
        ]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  // Emit completion lines when steps finish
  useEffect(() => {
    if (!isRunning) return;
    const newCompleted = completedActions.slice(completedCountRef.current);
    if (newCompleted.length === 0) return;
    completedCountRef.current = completedActions.length;

    setLines((prev) => [
      ...prev,
      ...newCompleted.map((step) => ({
        id: nextId++,
        text: step.resultSummary
          ? `${step.label || step.action} - ${step.resultSummary}`
          : `${step.label || step.action} done`,
        type: "success" as const,
        timestamp: now(),
      })),
    ]);
  }, [isRunning, completedActions]);

  // Simulated micro-actions on interval
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      // If the current action changed, reset micro index
      if (currentAction !== lastActionRef.current) {
        lastActionRef.current = currentAction;
        microIndexRef.current = 0;
      }

      const pool = currentAction
        ? MICRO_ACTIONS[currentAction] || IDLE_LINES
        : IDLE_LINES;

      const text = pool[microIndexRef.current % pool.length];
      microIndexRef.current++;

      setLines((prev) => {
        const next = [
          ...prev,
          {
            id: nextId++,
            text,
            type: "working" as const,
            timestamp: now(),
          },
        ];
        // Keep last 20 lines max
        return next.length > 20 ? next.slice(-20) : next;
      });
    }, 2400 + Math.random() * 1200); // 2.4-3.6s between lines

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, currentAction]);

  return lines;
}
