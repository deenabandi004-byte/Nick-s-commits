// src/services/loopAlerts.ts
// Client API for the user's Loop alert email preferences.
//
// Pairs with backend/app/routes/loop_notifications.py
//   GET   /api/users/me/loop-alert-email
//   PATCH /api/users/me/loop-alert-email
//
// PR2 scaffold: backend send is flag-gated (LOOPS_ALERT_EMAILS_ENABLED defaults
// off), so these prefs live in Firestore but no email goes out until PR3.

import { API_BASE_URL } from "./api";

export type LoopAlertMode = "digest" | "instant";
export type LoopAlertDeliveryStatus = "ok" | "bounce" | "complaint";

export interface LoopAlertEmailPrefs {
  enabled: boolean;
  mode: LoopAlertMode;
  quietHours: { start: number; end: number };
  timezone: string;
  deliveryStatus: LoopAlertDeliveryStatus;
}

async function alertsFetch(method: "GET" | "PATCH", body?: object): Promise<LoopAlertEmailPrefs> {
  const { auth } = await import("../lib/firebase");
  await auth.authStateReady();

  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();
  const res = await fetch(`${API_BASE_URL}/users/me/loop-alert-email`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j.message || j.error || "";
    } catch {
      // ignore
    }
    throw new Error(detail || `Loop alerts API error: ${res.status}`);
  }
  return (await res.json()) as LoopAlertEmailPrefs;
}

export async function getLoopAlertEmail(): Promise<LoopAlertEmailPrefs> {
  return alertsFetch("GET");
}

export async function updateLoopAlertEmail(
  patch: Partial<LoopAlertEmailPrefs>
): Promise<LoopAlertEmailPrefs> {
  return alertsFetch("PATCH", patch);
}
