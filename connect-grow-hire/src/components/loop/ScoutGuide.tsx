// ScoutGuide — the friendly companion in the Loops header.
//
// Ported from `Loops Overview.html`: a small speech-bubble + bobbing
// Scout-loops mascot. Replaces the corner "Ask Scout" pin on this surface
// so the page has exactly one Scout, not two. The bubble explains in one
// plain line what the page is doing.

import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import ScoutYetiFull from "@/assets/scouts/scout-yeti-full.png";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const KEYFRAMES = `
@keyframes oBob    { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
@keyframes oBubble { from { opacity: 0; transform: translateY(6px) scale(.97); }
                     to   { opacity: 1; transform: translateY(0)   scale(1);   } }
@media (prefers-reduced-motion: reduce) {
  .scout-guide-anim { animation: none !important; }
}
`;

export function ScoutGuide() {
  const { user } = useFirebaseAuth();
  const firstName = (user?.name || "").trim().split(/\s+/)[0] || "there";
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <div
        className="scout-guide-anim flex items-end shrink-0"
        style={{
          gap: 10,
          animation: `oBubble .6s ${EASE} .3s both`,
        }}
      >
        <div
          className="relative"
          style={{
            maxWidth: 250,
            background: "#fff",
            border: "1px solid var(--line)",
            borderRadius: 16,
            padding: "13px 16px",
            boxShadow: "var(--shadow-md)",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: "var(--ink-2)",
              lineHeight: 1.5,
            }}
          >
            Hi {firstName}, I keep these Loops hunting in the background.{" "}
            <strong style={{ color: "var(--heading)", fontWeight: 600 }}>
              Wake one up
            </strong>{" "}
            and I'll get back to it.
          </div>
          {/* Speech-bubble tail */}
          <span
            style={{
              position: "absolute",
              right: -6,
              bottom: 20,
              width: 12,
              height: 12,
              background: "#fff",
              borderRight: "1px solid var(--line)",
              borderTop: "1px solid var(--line)",
              transform: "rotate(45deg)",
            }}
          />
        </div>
        <img
          src={ScoutYetiFull}
          alt=""
          className="scout-guide-anim"
          style={{
            width: 88,
            objectFit: "contain",
            flexShrink: 0,
            filter: "drop-shadow(0 12px 18px rgba(30,45,77,.18))",
            animation: "oBob 3.2s ease-in-out infinite",
          }}
        />
      </div>
    </>
  );
}
