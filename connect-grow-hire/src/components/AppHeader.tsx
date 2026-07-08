interface AppHeaderProps {
  title?: string;
  titleIcon?: React.ReactNode;
  centerContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
}

/**
 * AppHeader — visually removed. The 3 header icons moved to the sidebar and
 * Scout opens via a floating button. The old global reply / loop-run toasts
 * were removed entirely; login notifications now live in LoginNotification
 * (mounted once in App.tsx). This component is kept as a null-rendering no-op
 * because many pages still import and render it; props are accepted but ignored
 * for backward compatibility.
 */
export function AppHeader(_props: AppHeaderProps) {
  // No-op. The login summary is owned by LoginNotification (mounted in App.tsx).
  // The old global reply / loop-run toasts were removed; this component is kept
  // only because many pages still import and render it.
  return null;
}
