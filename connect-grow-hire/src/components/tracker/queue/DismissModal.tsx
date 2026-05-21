/**
 * DismissModal - reason picker for dismissing a queued contact.
 *
 * Reasons map 1:1 to backend VALID_DISMISS_REASONS:
 *   wrong_company → adds company to blocklist.companies
 *   wrong_person  → adds title to blocklist.titles
 *   not_now       → no blocklist update (soft dismiss)
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { QueueDismissReason } from "@/services/api";

interface DismissModalProps {
  open: boolean;
  contactName: string;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: (reason: QueueDismissReason) => void;
}

const REASON_OPTIONS: Array<{
  value: QueueDismissReason;
  label: string;
  helper: string;
}> = [
  {
    value: "wrong_company",
    label: "Wrong company",
    helper: "We'll stop suggesting anyone from this company.",
  },
  {
    value: "wrong_person",
    label: "Wrong role / title",
    helper: "We'll stop suggesting this job title.",
  },
  {
    value: "not_now",
    label: "Not right now",
    helper: "We'll leave the company and title on your list.",
  },
];

export function DismissModal({
  open,
  contactName,
  isSubmitting = false,
  onCancel,
  onConfirm,
}: DismissModalProps) {
  const [selected, setSelected] = useState<QueueDismissReason>("not_now");

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white rounded-[6px] shadow-xl border border-gray-100 overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Dismiss {contactName}?</h3>
          <p className="text-xs text-gray-500 mt-1">
            Help us tune future suggestions - pick a reason.
          </p>
        </div>

        <div className="px-5 py-3 space-y-2">
          {REASON_OPTIONS.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(opt.value)}
                className={`w-full text-left px-3 py-2.5 rounded-[4px] border transition-colors ${
                  isSelected
                    ? "border-[#3B82F6] bg-[#EFF6FF]"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${
                      isSelected ? "border-[#3B82F6] bg-[#3B82F6]" : "border-gray-300"
                    }`}
                  />
                  <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1 ml-5">{opt.helper}</p>
              </button>
            );
          })}
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-xs font-medium px-3 py-1.5 rounded-[3px] text-gray-600 hover:bg-gray-100 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-[3px] bg-[#3B82F6] text-white hover:bg-[#2563EB] disabled:opacity-40"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Confirm dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
