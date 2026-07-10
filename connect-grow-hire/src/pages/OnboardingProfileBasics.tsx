import { useState } from "react";
import { Check } from "lucide-react";
import { OB, obFieldLabel, obInput, obPrimaryButton, obFocus } from "./onboardingTheme";

export interface ProfileBasicsData {
  fullName: string;
  email: string;
  phone: string;
}

interface OnboardingProfileBasicsProps {
  onNext: (data: ProfileBasicsData) => void;
  initial?: Partial<ProfileBasicsData>;
  // The .edu student email lives on this step (Slate Split moved it here from
  // the plan step). Stored separately — never replaces the primary email.
  initialEduEmail?: string;
  onEduEmail?: (email: string) => void;
}

export const OnboardingProfileBasics = ({
  onNext,
  initial,
  initialEduEmail,
  onEduEmail,
}: OnboardingProfileBasicsProps) => {
  const [fullName, setFullName] = useState(initial?.fullName || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [hasEdu, setHasEdu] = useState(!!initialEduEmail);
  const [eduEmail, setEduEmail] = useState(initialEduEmail || "");
  const [eduError, setEduError] = useState("");

  const primaryIsEdu = email.toLowerCase().trim().endsWith(".edu");
  const valid = !!fullName.trim() && !!email.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (hasEdu && !primaryIsEdu) {
      const v = eduEmail.toLowerCase().trim();
      if (!v.includes("@") || !v.endsWith(".edu")) {
        setEduError("Enter a valid .edu email (e.g. you@university.edu).");
        return;
      }
      onEduEmail?.(eduEmail.trim());
    } else {
      onEduEmail?.("");
    }
    // Phone was dropped from this step in the Slate Split redesign; keep the
    // field in the data shape for downstream compatibility.
    onNext({ fullName: fullName.trim(), email: email.trim(), phone: initial?.phone || "" });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 16 }}>
        <label style={obFieldLabel} htmlFor="ob-fullName">Full legal name</label>
        <input
          id="ob-fullName"
          style={obInput}
          {...obFocus}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jane Doe"
          required
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={obFieldLabel} htmlFor="ob-email">Email</label>
        <input
          id="ob-email"
          type="email"
          style={obInput}
          {...obFocus}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@university.edu"
          required
        />
      </div>

      {/* .edu student-pricing toggle — confirmation state when the primary email is already .edu */}
      {primaryIsEdu ? (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            background: OB.primary50,
            border: `1px solid ${OB.primary100}`,
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 22,
            fontSize: 13.5,
            color: OB.ink2,
          }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: 6,
              background: OB.primary,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Check size={13} strokeWidth={3} />
          </span>
          <span>
            <strong style={{ color: OB.heading }}>.edu detected</strong>: student pricing unlocked.
          </span>
        </div>
      ) : (
        <>
          <label
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              background: OB.primary50,
              border: `1px solid ${OB.primary100}`,
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: hasEdu ? 14 : 22,
              cursor: "pointer",
              position: "relative",
            }}
          >
            <input
              type="checkbox"
              checked={hasEdu}
              onChange={(e) => {
                setHasEdu(e.target.checked);
                setEduError("");
              }}
              style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
            />
            <span
              aria-hidden
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                ...(hasEdu
                  ? { background: OB.primary, color: "#fff" }
                  : { background: "#fff", border: `1.5px solid ${OB.primary200}` }),
              }}
            >
              {hasEdu && <Check size={13} strokeWidth={3} />}
            </span>
            <span style={{ fontSize: 13.5, color: OB.ink2 }}>
              <strong style={{ color: OB.heading }}>I have a .edu email</strong>, unlock ~50% student
              pricing
            </span>
          </label>

          {hasEdu && (
            <div style={{ marginBottom: 22 }}>
              <input
                type="email"
                style={{ ...obInput, border: `1px solid ${OB.primary200}` }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = OB.primary;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${OB.primary100}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = OB.primary200;
                  e.currentTarget.style.boxShadow = "none";
                }}
                value={eduEmail}
                onChange={(e) => {
                  setEduEmail(e.target.value);
                  setEduError("");
                }}
                placeholder="you@university.edu"
              />
              {eduError && (
                <p style={{ fontSize: 12, color: "#DC2626", margin: "6px 0 0" }}>{eduError}</p>
              )}
            </div>
          )}
        </>
      )}

      <button
        type="submit"
        disabled={!valid}
        style={{ ...obPrimaryButton, opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "default" }}
        onMouseEnter={(e) => valid && (e.currentTarget.style.background = OB.primaryDark)}
        onMouseLeave={(e) => (e.currentTarget.style.background = OB.primary)}
      >
        Continue
      </button>
    </form>
  );
};
