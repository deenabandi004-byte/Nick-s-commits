import { useCallback, useEffect } from "react";
import { LockKeyhole, Unlock, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";

interface EliteGateModalProps {
  open: boolean;
  onClose: () => void;
}

export function EliteGateModal({ open, onClose }: EliteGateModalProps) {
  const navigate = useNavigate();

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={close}
    >
      <div
        className="relative bg-white rounded-[3px] p-8 md:p-10 max-w-md w-full mx-4 shadow-xl flex flex-col items-center space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          className="absolute top-4 right-4 text-[#94A3B8] hover:text-[#6B7280] transition-colors"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <LockKeyhole className="h-14 w-14 text-primary/60" />

        <h2 className="text-xl md:text-2xl font-bold text-foreground text-center">
          Elite Feature
        </h2>

        <p className="text-sm text-muted-foreground text-center max-w-md">
          Custom email templates are an Elite feature. Upgrade to Elite to create personalized outreach templates tailored to your goals.
        </p>

        <button
          type="button"
          onClick={() => {
            close();
            navigate("/pricing");
          }}
          className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full font-bold text-base text-white transition-all duration-150 hover:shadow-md hover:scale-[1.02]"
          style={{
            background: "linear-gradient(to right, #0F172A, #1E293B)",
          }}
        >
          <Unlock className="h-4 w-4" />
          Upgrade to Elite
        </button>

        <div className="mt-3 flex flex-col items-center space-y-1">
          <span className="text-xs text-muted-foreground">$34.99/mo · Cancel anytime</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
