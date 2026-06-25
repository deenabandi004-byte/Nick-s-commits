/**
 * ApplicationProfileModal — one-time collection of ATS screening answers.
 *
 * Opened in two cases:
 *   1. First time a user clicks "Auto-apply" (prepare endpoint returned
 *      PROFILE_REQUIRED). On save, we re-fire the prepare call.
 *   2. From Account Settings → "Application Profile" to edit later.
 *
 * Source-of-truth rule: demographics / veteran / disability default to
 * "Decline to answer." We NEVER infer race, gender, ethnicity, veteran, or
 * disability status from any other signal. Work authorization is required;
 * the form refuses to save without authorizedToWorkUS set.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  getApplicationProfile,
  saveApplicationProfile,
  type ApplicationProfile,
} from "@/services/api";

const DECLINE = "decline";

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non_binary", label: "Non-binary" },
  { value: DECLINE, label: "Decline to answer" },
];

const RACE_OPTIONS = [
  { value: "white", label: "White" },
  { value: "black", label: "Black or African American" },
  { value: "asian", label: "Asian" },
  { value: "hispanic", label: "Hispanic or Latino" },
  { value: "native_american", label: "American Indian or Alaska Native" },
  { value: "pacific_islander", label: "Native Hawaiian or Pacific Islander" },
  { value: "two_or_more", label: "Two or more races" },
  { value: DECLINE, label: "Decline to answer" },
];

const ETHNICITY_OPTIONS = [
  { value: "hispanic", label: "Hispanic or Latino" },
  { value: "not_hispanic", label: "Not Hispanic or Latino" },
  { value: DECLINE, label: "Decline to answer" },
];

const LGBTQ_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: DECLINE, label: "Decline to answer" },
];

const VETERAN_OPTIONS = [
  { value: "not_veteran", label: "I am not a protected veteran" },
  { value: "veteran", label: "I am a protected veteran" },
  { value: "disabled_veteran", label: "I am a disabled veteran" },
  { value: DECLINE, label: "Decline to answer" },
];

const DISABILITY_OPTIONS = [
  { value: "no", label: "No, I do not have a disability" },
  { value: "yes", label: "Yes, I have a disability" },
  { value: DECLINE, label: "Decline to answer" },
];

const VISA_OPTIONS = [
  { value: "us_citizen", label: "US citizen" },
  { value: "permanent_resident", label: "Permanent resident (green card)" },
  { value: "f1_opt", label: "F-1 / OPT / STEM-OPT" },
  { value: "h1b", label: "H-1B" },
  { value: "other", label: "Other" },
];

interface ApplicationProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (profile: ApplicationProfile) => void;
}

const EMPTY_PROFILE: ApplicationProfile = {
  contactInfo: {
    phone: null,
    linkedinUrl: null,
  },
  workAuthorization: {
    authorizedToWorkUS: null,
    requiresSponsorship: null,
    visaStatus: null,
  },
  demographics: {
    gender: DECLINE,
    race: DECLINE,
    ethnicity: DECLINE,
    lgbtq: DECLINE,
  },
  veteranStatus: "not_veteran",
  disabilityStatus: DECLINE,
  preferences: {
    earliestStartDate: null,
    expectedSalaryUsd: null,
    openToRelocation: null,
    openToRemote: null,
  },
  acknowledgedAt: null,
};

export function ApplicationProfileModal({
  open,
  onOpenChange,
  onSaved,
}: ApplicationProfileModalProps) {
  const [profile, setProfile] = useState<ApplicationProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    getApplicationProfile()
      .then((resp) => {
        const merged: ApplicationProfile = {
          ...EMPTY_PROFILE,
          ...resp.profile,
          contactInfo: {
            ...EMPTY_PROFILE.contactInfo,
            ...(resp.profile.contactInfo || {}),
          },
          workAuthorization: {
            ...EMPTY_PROFILE.workAuthorization,
            ...resp.profile.workAuthorization,
          },
          demographics: {
            ...EMPTY_PROFILE.demographics,
            ...resp.profile.demographics,
          },
          preferences: {
            ...EMPTY_PROFILE.preferences,
            ...resp.profile.preferences,
          },
        };
        setProfile(merged);
      })
      .catch(() => setError("Could not load your application profile."))
      .finally(() => setLoading(false));
  }, [open]);

  const workAuthSet = profile.workAuthorization.authorizedToWorkUS !== null;
  const canSave = workAuthSet && !saving;

  const handleSave = async () => {
    if (!workAuthSet) {
      setError("Please answer the work authorization question.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const resp = await saveApplicationProfile(profile);
      onSaved?.(resp.profile);
      onOpenChange(false);
    } catch {
      setError("Could not save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Application Profile</DialogTitle>
          <DialogDescription>
            We use these answers across every auto-apply so you only fill them
            once. Demographic questions default to "Decline to answer" — we
            never guess.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Contact information — overrides resume-parsed values */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Contact information</h3>
              <p className="text-xs text-muted-foreground">
                Resume parsers commonly miss phone numbers and don't capture
                LinkedIn. Fill these here to keep applications complete.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-phone" className="text-xs">
                    Phone number
                  </Label>
                  <Input
                    id="contact-phone"
                    type="tel"
                    placeholder="e.g. (555) 123-4567"
                    value={profile.contactInfo.phone ?? ""}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        contactInfo: {
                          ...profile.contactInfo,
                          phone: e.target.value || null,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-linkedin" className="text-xs">
                    LinkedIn URL
                  </Label>
                  <Input
                    id="contact-linkedin"
                    type="url"
                    placeholder="https://linkedin.com/in/yourhandle"
                    value={profile.contactInfo.linkedinUrl ?? ""}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        contactInfo: {
                          ...profile.contactInfo,
                          linkedinUrl: e.target.value || null,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </section>

            {/* Work authorization */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Work authorization</h3>
              <div className="grid gap-3">
                <YesNoRow
                  label="Are you legally authorized to work in the US? *"
                  value={profile.workAuthorization.authorizedToWorkUS}
                  onChange={(v) =>
                    setProfile({
                      ...profile,
                      workAuthorization: {
                        ...profile.workAuthorization,
                        authorizedToWorkUS: v,
                      },
                    })
                  }
                />
                <YesNoRow
                  label="Will you now or in the future require visa sponsorship?"
                  value={profile.workAuthorization.requiresSponsorship}
                  onChange={(v) =>
                    setProfile({
                      ...profile,
                      workAuthorization: {
                        ...profile.workAuthorization,
                        requiresSponsorship: v,
                      },
                    })
                  }
                />
                <SelectRow
                  label="Visa status"
                  value={profile.workAuthorization.visaStatus ?? ""}
                  options={VISA_OPTIONS}
                  onChange={(v) =>
                    setProfile({
                      ...profile,
                      workAuthorization: {
                        ...profile.workAuthorization,
                        visaStatus: v || null,
                      },
                    })
                  }
                />
              </div>
            </section>

            {/* Demographics */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">
                EEO demographics (voluntary)
              </h3>
              <p className="text-xs text-muted-foreground">
                Always voluntary. Defaults to "Decline to answer" unless you
                explicitly set a value.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <SelectRow
                  label="Gender"
                  value={profile.demographics.gender ?? DECLINE}
                  options={GENDER_OPTIONS}
                  onChange={(v) =>
                    setProfile({
                      ...profile,
                      demographics: { ...profile.demographics, gender: v },
                    })
                  }
                />
                <SelectRow
                  label="Race"
                  value={profile.demographics.race ?? DECLINE}
                  options={RACE_OPTIONS}
                  onChange={(v) =>
                    setProfile({
                      ...profile,
                      demographics: { ...profile.demographics, race: v },
                    })
                  }
                />
                <SelectRow
                  label="Ethnicity"
                  value={profile.demographics.ethnicity ?? DECLINE}
                  options={ETHNICITY_OPTIONS}
                  onChange={(v) =>
                    setProfile({
                      ...profile,
                      demographics: { ...profile.demographics, ethnicity: v },
                    })
                  }
                />
                <SelectRow
                  label="LGBTQ+"
                  value={profile.demographics.lgbtq ?? DECLINE}
                  options={LGBTQ_OPTIONS}
                  onChange={(v) =>
                    setProfile({
                      ...profile,
                      demographics: { ...profile.demographics, lgbtq: v },
                    })
                  }
                />
              </div>
            </section>

            {/* Veteran + disability */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Self-identification</h3>
              <div className="grid grid-cols-2 gap-3">
                <SelectRow
                  label="Protected veteran status"
                  value={profile.veteranStatus ?? "not_veteran"}
                  options={VETERAN_OPTIONS}
                  onChange={(v) =>
                    setProfile({ ...profile, veteranStatus: v })
                  }
                />
                <SelectRow
                  label="Disability status"
                  value={profile.disabilityStatus ?? DECLINE}
                  options={DISABILITY_OPTIONS}
                  onChange={(v) =>
                    setProfile({ ...profile, disabilityStatus: v })
                  }
                />
              </div>
            </section>

            {/* Preferences */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Preferences</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="start-date" className="text-xs">
                    Earliest start date
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={profile.preferences.earliestStartDate ?? ""}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        preferences: {
                          ...profile.preferences,
                          earliestStartDate: e.target.value || null,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="salary" className="text-xs">
                    Expected salary (USD/yr, optional)
                  </Label>
                  <Input
                    id="salary"
                    type="number"
                    placeholder="e.g. 75000"
                    value={profile.preferences.expectedSalaryUsd ?? ""}
                    onChange={(e) => {
                      const n = e.target.value
                        ? Number(e.target.value)
                        : null;
                      setProfile({
                        ...profile,
                        preferences: {
                          ...profile.preferences,
                          expectedSalaryUsd: Number.isFinite(n as number)
                            ? n
                            : null,
                        },
                      });
                    }}
                  />
                </div>
                <YesNoRow
                  label="Open to relocation?"
                  value={profile.preferences.openToRelocation}
                  onChange={(v) =>
                    setProfile({
                      ...profile,
                      preferences: {
                        ...profile.preferences,
                        openToRelocation: v,
                      },
                    })
                  }
                />
                <YesNoRow
                  label="Open to remote work?"
                  value={profile.preferences.openToRemote}
                  onChange={(v) =>
                    setProfile({
                      ...profile,
                      preferences: {
                        ...profile.preferences,
                        openToRemote: v,
                      },
                    })
                  }
                />
              </div>
            </section>

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
              </>
            ) : (
              "Save profile"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Small row helpers
// ---------------------------------------------------------------------------

interface YesNoRowProps {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}

function YesNoRow({ label, value, onChange }: YesNoRowProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={value === true ? "default" : "outline"}
          onClick={() => onChange(true)}
        >
          Yes
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value === false ? "default" : "outline"}
          onClick={() => onChange(false)}
        >
          No
        </Button>
      </div>
    </div>
  );
}

interface SelectRowProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}

function SelectRow({ label, value, options, onChange }: SelectRowProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
