import React, { useEffect, useRef, useState } from 'react';

interface SearchPromptBoxProps {
  /** Input region rendered inside the white type-area (textarea + any overlays). */
  children: React.ReactNode;
  /** Circular send button handler. */
  onSubmit: () => void;
  submitDisabled?: boolean;
  /** Content inside the circular send button (e.g. <ArrowUp/> or <Loader2/>). */
  submitIcon: React.ReactNode;
  submitAriaLabel?: string;
  /** Muted helper line above the type-area. Defaults to the People-tab copy. */
  helper?: React.ReactNode;
  /** Content inside the grey container, below the white type-area (chips, etc.). */
  footer?: React.ReactNode;
  /** Min height of the white type-area. Defaults to 120, matching the People tab. */
  typeAreaMinHeight?: number;
  /**
   * Optional input value used to trigger the typing-flash on the send button.
   * When this changes, the button briefly tints vibrant-blue then fades back
   * to slate. Pass the parent's prompt/text state. Skipped on first render so
   * the flash only fires on user-typed changes.
   */
  inputValue?: string;
}

/** Small helper to render an underlined keyword inside a helper line. */
const underline = (label: string) => (
  <span style={{ textDecoration: 'underline', textUnderlineOffset: 2, textDecorationColor: 'var(--ink-3, #8A8F9A)' }}>
    {label}
  </span>
);

/** Default helper line, Find People copy. Reflects Draft mode (the default). */
export const PEOPLE_SEARCH_HELPER = (
  <>
    For best results include {underline('company')}, {underline('role')}, and {underline('location')}{' '}
    to get personalized email drafts
  </>
);

/** Find People helper, Send mode: outreach is sent, not just drafted. */
export const PEOPLE_SEARCH_HELPER_SEND = (
  <>
    For best results include {underline('company')}, {underline('role')}, and {underline('location')}{' '}
    to send personalized outreach emails
  </>
);

/** Find People helper, Preview mode: contact info only, no email is written. */
export const PEOPLE_SEARCH_HELPER_PREVIEW = (
  <>
    For best results include {underline('company')}, {underline('role')}, and {underline('location')}{' '}
    to find the best matching contacts
  </>
);

/** Find Companies helper line — tailored to company discovery. */
export const COMPANIES_SEARCH_HELPER = (
  <>
    For best results include {underline('industry')}, {underline('location')}, and {underline('role')}{' '}
    to discover companies that fit you
  </>
);

/**
 * The grey search-box shell shared by the Find People and Find Companies tabs.
 * Owns the container, helper line, white type-area, and circular send button.
 * Tab-specific input + recommendations are passed via `children` / `footer`.
 */
export const SearchPromptBox: React.FC<SearchPromptBoxProps> = ({
  children, onSubmit, submitDisabled, submitIcon, submitAriaLabel = 'Search',
  helper = PEOPLE_SEARCH_HELPER, footer, typeAreaMinHeight = 120, inputValue,
}) => {
  // Vibrant-on-hover state for the circular send button.
  const [btnHovering, setBtnHovering] = useState(false);

  // Typing flash: each change to inputValue tints the button vibrant blue,
  // then fades back to the slate accent ~700ms after typing stops. The first
  // render is skipped so the flash only fires on user-typed updates, not on
  // initial mount.
  const [btnFlashing, setBtnFlashing] = useState(false);
  const btnFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialRender = useRef(true);
  useEffect(() => {
    if (inputValue === undefined) return;
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    setBtnFlashing(true);
    if (btnFlashTimer.current) clearTimeout(btnFlashTimer.current);
    btnFlashTimer.current = setTimeout(() => setBtnFlashing(false), 700);
  }, [inputValue]);
  useEffect(() => () => {
    if (btnFlashTimer.current) clearTimeout(btnFlashTimer.current);
  }, []);

  const showVibrant = btnFlashing || btnHovering;

  return (
  <div
    style={{
      display: 'flex', flexDirection: 'column', position: 'relative',
      background: 'var(--surface, #F5F6F8)',
      border: '1px solid var(--line, #E5E5E0)',
      borderRadius: 16, padding: 24,
    }}
  >
    {/* Helper line */}
    {helper && (
      <div style={{ fontSize: 13, color: 'var(--ink-3, #8A8F9A)', marginBottom: 12, marginLeft: 2 }}>
        {helper}
      </div>
    )}

    {/* White type-area */}
    <div
      style={{
        position: 'relative', width: '100%',
        background: 'var(--paper, #FFFFFF)',
        border: '1px solid var(--line, #E5E5E0)',
        borderRadius: 12, padding: '14px 16px',
        minHeight: typeAreaMinHeight,
      }}
    >
      {children}
      {/* Circular send button — slate-blue (--accent) while dormant, flashes
          vibrant --brand-blue while the user is typing (each input change
          resets the timer), and stays vibrant on hover. */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitDisabled}
        onMouseEnter={() => setBtnHovering(true)}
        onMouseLeave={() => setBtnHovering(false)}
        aria-label={submitAriaLabel}
        style={{
          position: 'absolute', right: 12, bottom: 12,
          width: 34, height: 34, borderRadius: '50%',
          background: showVibrant
            ? 'var(--brand-blue, #3B82F6)'
            : 'var(--accent, #4A60A8)',
          color: '#fff', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: submitDisabled ? 'not-allowed' : 'pointer',
          opacity: submitDisabled ? 0.75 : 1,
          boxShadow: showVibrant
            ? '0 2px 8px rgba(59,130,246,0.35)'
            : 'none',
          transition: 'background .35s ease, box-shadow .25s ease, opacity .15s ease',
          zIndex: 2,
        }}
      >
        {submitIcon}
      </button>
    </div>

    {footer}
  </div>
  );
};

export default SearchPromptBox;
