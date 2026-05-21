/**
 * RefineSheet - 3-field override for manual queue generation.
 *
 * Opens when the user clicks "Refine" on the Suggested For You tab, or
 * automatically when backend returns `needsRefine: true` (i.e. the user's
 * onboarding profile doesn't have enough to build a query).
 *
 * The only three fields are company, title keywords, university. Anything
 * more belongs in full Search or scope creep (see plan-eng-review).
 */
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { QueueFilters } from "@/services/api";

interface RefineSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFilters?: QueueFilters;
  isSubmitting?: boolean;
  onSubmit: (filters: QueueFilters) => void;
}

export function RefineSheet({
  open,
  onOpenChange,
  initialFilters,
  isSubmitting = false,
  onSubmit,
}: RefineSheetProps) {
  const [company, setCompany] = useState(initialFilters?.company || "");
  const [titleKeywords, setTitleKeywords] = useState(initialFilters?.titleKeywords || "");
  const [university, setUniversity] = useState(initialFilters?.university || "");

  useEffect(() => {
    if (open) {
      setCompany(initialFilters?.company || "");
      setTitleKeywords(initialFilters?.titleKeywords || "");
      setUniversity(initialFilters?.university || "");
    }
  }, [open, initialFilters]);

  const canSubmit = Boolean(company.trim() || titleKeywords.trim());

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      company: company.trim() || undefined,
      titleKeywords: titleKeywords.trim() || undefined,
      university: university.trim() || undefined,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Refine your queue</SheetTitle>
          <SheetDescription>
            Adjust who we surface next. At least one of company or title keywords
            is required.
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block" htmlFor="refine-company">
              Company
            </label>
            <input
              id="refine-company"
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. Goldman Sachs"
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-[3px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6]"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block" htmlFor="refine-title">
              Title keywords
            </label>
            <input
              id="refine-title"
              type="text"
              value={titleKeywords}
              onChange={(e) => setTitleKeywords(e.target.value)}
              placeholder="e.g. investment banking analyst"
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-[3px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6]"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block" htmlFor="refine-university">
              University <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="refine-university"
              type="text"
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              placeholder="e.g. University of Southern California"
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-[3px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6]"
            />
          </div>
        </div>

        <SheetFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="text-xs font-medium px-3 py-1.5 rounded-[3px] text-gray-600 hover:bg-gray-100 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-[3px] bg-[#3B82F6] text-white hover:bg-[#2563EB] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Generate queue
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
