import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  Coffee,
  Download,
  Trash2,
  ArrowLeft,
  Loader2,
  BadgeCheck,
  MapPin,
  Calendar,
  FileText,
} from "lucide-react";
import { CreditPill } from "@/components/credits";
import { CompanyLogo } from "@/components/CompanyLogo";
import { apiService } from "@/services/api";
import type { CoffeeChatPrep } from "@/services/api";
import { toast } from "@/hooks/use-toast";
import { trackContentViewed, trackError } from "../lib/analytics";

const CoffeeChatLibrary: React.FC = () => {
  const { user } = useFirebaseAuth();
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
        // Track PostHog event
        trackContentViewed('coffee_chat_prep', 'pdf', prep.id);
        return;
      }
      const { pdfUrl } = await apiService.downloadCoffeeChatPDF(prep.id);
      if (pdfUrl) {
        window.open(pdfUrl, "_blank", "noopener");
        // Track PostHog event
        trackContentViewed('coffee_chat_prep', 'pdf', prep.id);
      } else {
        throw new Error("PDF URL not available yet");
      }
    } catch (error) {
      trackError('coffee_chat_prep', 'download', 'network_error', error instanceof Error ? error.message : undefined);
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
    <SidebarProvider>
      <div className="flex min-h-screen w-full font-sans" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>
        <AppSidebar />

        <div className="flex-1">
          <AppHeader title="Coffee Chat Library" />

          <main style={{ background: 'var(--paper)', padding: '24px 40px 44px' }}>
            <div style={{ maxWidth: 800, margin: '0 auto' }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)', fontFamily: "'Instrument Serif', Georgia, serif", display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Coffee className="h-5 w-5" style={{ color: 'var(--brand-blue, #3B82F6)' }} />
                    Saved Coffee Chat Preps
                  </h2>
                  <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                    Review, download, or delete the one-pagers you've generated.
                  </p>
                </div>
                <Button
                  onClick={() => navigate('/coffee-chat-prep')}
                  style={{ background: 'var(--brand-blue, #3B82F6)', color: '#fff', borderRadius: 3 }}
                  className="hover:opacity-90"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Create New Prep
                </Button>
              </div>

              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 192, borderRadius: 3, border: '1px solid var(--line)', background: 'var(--paper-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink-2)' }}>
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--brand-blue, #3B82F6)' }} />
                    Loading your library...
                  </div>
                </div>
              ) : preps.length === 0 ? (
                <div style={{ borderRadius: 3, border: '1px solid var(--line)', background: 'var(--paper-2)', padding: 32, textAlign: 'center' }}>
                  <Coffee className="h-10 w-10 mx-auto" style={{ color: 'var(--brand-blue, #3B82F6)', marginBottom: 12 }} />
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', fontFamily: "'Instrument Serif', Georgia, serif", marginBottom: 6 }}>No preps yet</h3>
                  <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 16 }}>
                    Generate your first coffee chat prep to see it appear here.
                  </p>
                  <Button
                    onClick={() => navigate('/coffee-chat-prep')}
                    style={{ background: 'var(--brand-blue, #3B82F6)', color: '#fff', borderRadius: 3 }}
                    className="hover:opacity-90"
                  >
                    Create Coffee Chat Prep
                  </Button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {groupedPreps.inProgress.length > 0 && (
                    <section>
                      <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', marginBottom: 10 }}>
                        In Progress
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {groupedPreps.inProgress.map((prep) => (
                          <div
                            key={prep.id}
                            style={{ padding: '12px 14px', borderRadius: 3, border: '1px solid var(--line)', background: 'var(--paper-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                          >
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{prep.contactName}</p>
                              <p style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                                {prep.jobTitle} @ {prep.company}
                              </p>
                              <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                                Requested {prep.createdAt ? new Date(prep.createdAt).toLocaleString() : ''}
                              </p>
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', color: 'var(--signal-wait, #ca8a04)' }}>Processing...</div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {groupedPreps.completed.length > 0 && (
                    <section>
                      <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-3)', marginBottom: 10 }}>
                        Completed ({groupedPreps.completed.length})
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {groupedPreps.completed.map((prep) => (
                          <div
                            key={prep.id}
                            className="md:flex-row md:items-center md:justify-between"
                            style={{ padding: '14px 16px', borderRadius: 3, border: '1px solid var(--line)', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: 12 }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                              <CompanyLogo company={prep.company} size={36} rounded={9} />
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>
                                  <BadgeCheck className="h-4 w-4" style={{ color: 'var(--signal-pos, #16a34a)' }} />
                                  {prep.contactName}
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                                  {prep.jobTitle} @ {prep.company}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, fontSize: 11, color: 'var(--ink-3)' }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Calendar className="h-3 w-3" />
                                    {prep.createdAt ? new Date(prep.createdAt).toLocaleDateString() : '-'}
                                  </span>
                                  {prep.hometown && (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <MapPin className="h-3 w-3" />
                                      {prep.hometown}
                                    </span>
                                  )}
                                </div>
                                {prep.industrySummary && (
                                  <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                                    {prep.industrySummary}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownload(prep)}
                                style={{ borderColor: 'rgba(59,130,246,0.4)', color: 'var(--brand-blue, #3B82F6)', borderRadius: 3 }}
                                className="hover:bg-[#3B82F6]/10"
                              >
                                <Download className="h-4 w-4 mr-2" />
                                PDF
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={deletingId === prep.id}
                                onClick={() => handleDelete(prep.id)}
                                style={{ color: 'var(--signal-neg, #dc2626)', borderRadius: 3 }}
                                className="hover:bg-red-50"
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
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default CoffeeChatLibrary;