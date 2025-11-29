/**
 * CoffeeChatLibraryContent.tsx - Reusable Coffee Chat Library Content
 * 
 * This component displays the list of saved coffee chat preps.
 * Used in both the Coffee Chat Prep page (as a tab) and the standalone library page.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Coffee,
  Download,
  Trash2,
  Loader2,
  BadgeCheck,
  MapPin,
  Calendar,
  FileText,
} from "lucide-react";
import { apiService } from "@/services/api";
import type { CoffeeChatPrep } from "@/services/api";
import { toast } from "@/hooks/use-toast";

interface CoffeeChatLibraryContentProps {
  /** If true, shows a "Create New Prep" button that navigates */
  showCreateButton?: boolean;
  /** Custom navigation path for "Create New Prep" button */
  createButtonPath?: string;
}

export const CoffeeChatLibraryContent: React.FC<CoffeeChatLibraryContentProps> = ({
  showCreateButton = true,
  createButtonPath = "/home?tab=coffee-chat",
}) => {
  const navigate = useNavigate();
  const [preps, setPreps] = useState<CoffeeChatPrep[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const loadPreps = async () => {
      try {
        console.log("🔍 Starting to load coffee chat preps...");
        const result = await apiService.getAllCoffeeChatPreps();
        console.log("📦 Raw result from API:", result);
        
        if ("error" in result) {
          console.error("❌ Error in result:", result.error);
          throw new Error(result.error);
        }
        
        console.log("✅ Preps received:", result.preps);
        console.log("📊 Number of preps:", result.preps?.length || 0);
        
        setPreps(result.preps || []);
      } catch (error) {
        console.error("💥 Failed to load coffee chat preps:", error);
        toast({
          title: "Unable to load library",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
        console.log("🏁 Loading complete");
      }
    };

    loadPreps();
  }, []);

  const handleDownload = async (prep: CoffeeChatPrep) => {
    try {
      if (prep.pdfUrl) {
        window.open(prep.pdfUrl, "_blank", "noopener");
        return;
      }
      const { pdfUrl } = await apiService.downloadCoffeeChatPDF(prep.id);
      if (pdfUrl) {
        window.open(pdfUrl, "_blank", "noopener");
      } else {
        throw new Error("PDF URL not available yet");
      }
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Could not open the PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (prepId: string) => {
    setDeletingId(prepId);
    try {
      const result = await apiService.deleteCoffeeChatPrep(prepId);
      if ("error" in result) {
        throw new Error(result.error);
      }
      setPreps((prev) => prev.filter((prep) => prep.id !== prepId));
      toast({
        title: "Prep deleted",
        description: "Removed from your Coffee Chat Library.",
      });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const groupedPreps = useMemo(() => {
    const completed = preps.filter((p) => p.status === "completed");
    const inProgress = preps.filter((p) => p.status !== "completed");
    return { completed, inProgress };
  }, [preps]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
            <Coffee className="h-5 w-5 text-green-400" />
            Saved Coffee Chat Preps
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Review, download, or delete the one-pagers you've generated.
          </p>
        </div>
        {showCreateButton && (
          <Button 
            onClick={() => navigate(createButtonPath)} 
            className="bg-green-500/80 hover:bg-green-500 text-white"
          >
            <FileText className="h-4 w-4 mr-2" />
            Create New Prep
          </Button>
        )}
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center h-48 rounded-xl border border-gray-700 bg-gray-800/50">
          <div className="flex items-center gap-3 text-gray-300">
            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            Loading your library...
          </div>
        </div>
      ) : preps.length === 0 ? (
        /* Empty State */
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-10 text-center space-y-4">
          <Coffee className="h-10 w-10 mx-auto text-green-400" />
          <h3 className="text-lg font-semibold text-white">No preps yet</h3>
          <p className="text-sm text-gray-400">
            Generate your first coffee chat prep to see it appear here.
          </p>
          {showCreateButton && (
            <Button 
              onClick={() => navigate(createButtonPath)} 
              className="bg-green-500/80 hover:bg-green-500 text-white"
            >
              Create Coffee Chat Prep
            </Button>
          )}
        </div>
      ) : (
        /* Preps List */
        <div className="space-y-6">
          {/* In Progress Section */}
          {groupedPreps.inProgress.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">
                In Progress
              </h3>
              <div className="grid gap-4">
                {groupedPreps.inProgress.map((prep) => (
                  <div
                    key={prep.id}
                    className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-5 py-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm text-gray-200 font-medium">{prep.contactName}</p>
                      <p className="text-xs text-gray-400">
                        {prep.jobTitle} @ {prep.company}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Requested {prep.createdAt ? new Date(prep.createdAt).toLocaleString() : ""}
                      </p>
                    </div>
                    <div className="text-xs uppercase text-yellow-300">Processing...</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Completed Section */}
          {groupedPreps.completed.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-400 uppercase">
                Completed ({groupedPreps.completed.length})
              </h3>
              <div className="grid gap-4">
                {groupedPreps.completed.map((prep) => (
                  <div
                    key={prep.id}
                    className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-white font-medium">
                        <BadgeCheck className="h-4 w-4 text-green-400" />
                        {prep.contactName}
                      </div>
                      <div className="text-sm text-gray-300">
                        {prep.jobTitle} @ {prep.company}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {prep.createdAt ? new Date(prep.createdAt).toLocaleDateString() : "—"}
                        </span>
                        {prep.hometown && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {prep.hometown}
                          </span>
                        )}
                      </div>
                      {prep.industrySummary && (
                        <p className="text-xs text-gray-400 line-clamp-2">
                          {prep.industrySummary}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-blue-500/60 text-blue-200 hover:bg-blue-500/10"
                        onClick={() => handleDownload(prep)}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        PDF
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-300 hover:text-red-200 hover:bg-red-500/10"
                        disabled={deletingId === prep.id}
                        onClick={() => handleDelete(prep.id)}
                      >
                        {deletingId === prep.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

