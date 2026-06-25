import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router-dom";
import { RefreshCw, Search, Loader2, AlertCircle } from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/AppHeader";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { apiService, type OutboxThread, type OutboxStats, type Nudge } from "@/services/api";
import { TrackerBuckets } from "@/components/tracker/TrackerBuckets";
import { ConversationPanel } from "@/components/tracker/ConversationPanel";
import { NudgePanel } from "@/components/tracker/NudgePanel";
import { QueuePanel } from "@/components/tracker/queue/QueuePanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DONE_STAGES } from "@/lib/outboxConstants";
import { daysBetween } from "@/lib/formatters";
import { trackContentViewed } from "@/lib/analytics";

// --- bucket sorting helpers ---

function isNeedsAttention(c: OutboxThread): boolean {
  // Snoozed contacts are suppressed from needs-attention until snooze expires
  if (c.snoozedUntil && new Date(c.snoozedUntil) > new Date()) return false;
  if (c.hasUnreadReply) return true;
  if (c.pipelineStage === "draft_deleted") return true;
  if (c.pipelineStage === "draft_created" && daysBetween(c.draftCreatedAt) >= 3) return true;
  if (c.nextFollowUpAt && new Date(c.nextFollowUpAt) <= new Date()) return true;
  return false;
}

function isDone(c: OutboxThread): boolean {
  if (c.archivedAt) return true;
  return DONE_STAGES.has(c.pipelineStage || "");
}

// --- component ---

export default function NetworkTracker() {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { notifications, markOneRead } = useNotifications();
  const location = useLocation();

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"pipeline" | "queue" | "nudges">("pipeline");

  // Track page view for flywheel baseline measurement
  useEffect(() => {
    trackContentViewed("network_tracker", "page_view");
  }, []);

  // Pre-select contact from notification click
  useEffect(() => {
    const state = location.state as { selectContactId?: string } | null;
    if (state?.selectContactId) {
      setSelectedContactId(state.selectContactId);
      // Clear the state so it doesn't re-select on subsequent renders
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  // Deep-link from Loop activity feed: /tracker?contact=<id> opens that
  // contact's conversation panel. We strip the param after consuming it so
  // a refresh doesn't keep re-opening the same one.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("contact");
    if (id) {
      setSelectedContactId(id);
      const next = new URLSearchParams(searchParams);
      next.delete("contact");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // --- queries ---

  const {
    data: threadsData,
    isLoading: threadsLoading,
    isError: threadsError,
  } = useQuery({
    queryKey: ["trackerContacts"],
    queryFn: async () => {
      const res = await apiService.getOutboxThreads();
      if ("error" in res) throw new Error(res.error);
      return res.threads;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const { data: statsData } = useQuery({
    queryKey: ["trackerStats"],
    queryFn: async () => {
      const res = await apiService.getOutboxStats();
      if ("error" in res) throw new Error(res.error);
      return res as OutboxStats;
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const { data: nudgesData } = useQuery({
    queryKey: ["trackerNudges"],
    queryFn: async () => {
      const res = await apiService.getNudges({ status: "pending", limit: 10 });
      if ("error" in res) throw new Error(res.error);
      return res.nudges ?? [];
    },
    enabled: !!user,
    refetchInterval: 60_000,
    retry: 1,
  });

  // --- mutations ---

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["trackerContacts"] });
    queryClient.invalidateQueries({ queryKey: ["trackerStats"] });
    queryClient.invalidateQueries({ queryKey: ["trackerNudges"] });
  };

  const stageChangeMutation = useMutation({
    mutationFn: ({ contactId, stage }: { contactId: string; stage: string }) => {
      setMutatingIds((prev) => new Set(prev).add(contactId));
      return apiService.patchOutboxStage(contactId, stage as any);
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Stage updated" });
    },
    onError: () => toast({ title: "Failed to update stage", variant: "destructive" }),
    onSettled: (_data, _err, { contactId }) => {
      setMutatingIds((prev) => { const next = new Set(prev); next.delete(contactId); return next; });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (contactId: string) => apiService.archiveOutboxThread(contactId),
    onSuccess: () => {
      setSelectedContactId(null);
      invalidateAll();
      toast({ title: "Contact archived" });
    },
    onError: () => toast({ title: "Failed to archive", variant: "destructive" }),
  });

  const unarchiveMutation = useMutation({
    mutationFn: (contactId: string) => apiService.unarchiveOutboxThread(contactId),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Contact restored" });
    },
    onError: () => toast({ title: "Failed to restore", variant: "destructive" }),
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ contactId, until }: { contactId: string; until: string }) =>
      apiService.snoozeOutboxThread(contactId, until),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Contact snoozed" });
    },
    onError: () => toast({ title: "Failed to snooze", variant: "destructive" }),
  });

  const wonMutation = useMutation({
    mutationFn: (contactId: string) => apiService.markOutboxThreadWon(contactId),
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Marked as won!" });
    },
    onError: () => toast({ title: "Failed to mark as won", variant: "destructive" }),
  });

  const markReadMutation = useMutation({
    mutationFn: (contactId: string) =>
      apiService.markOutboxThreadRead(contactId),
    onSuccess: (_data, contactId) => {
      invalidateAll();
      markOneRead(contactId);
    },
  });

  const syncMutation = useMutation({
    mutationFn: (contactId: string) => {
      setSyncingIds((prev) => new Set(prev).add(contactId));
      return apiService.syncOutboxThread(contactId);
    },
    onSuccess: () => invalidateAll(),
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
    onSettled: (_data, _err, contactId) => {
      setSyncingIds((prev) => { const next = new Set(prev); next.delete(contactId); return next; });
    },
  });

  const nudgeDismissMutation = useMutation({
    mutationFn: (nudgeId: string) => apiService.updateNudge(nudgeId, "dismissed"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trackerNudges"] });
    },
  });

  const nudgeActMutation = useMutation({
    mutationFn: async (nudge: Nudge) => {
      if (nudge.followUpDraft) {
        // Try to create a Gmail draft from the follow-up text
        const res = await apiService.createNudgeDraft(nudge.id);
        if ("error" in res) throw new Error(res.error);
        return res;
      }
      // No draft text — just mark as acted_on
      return apiService.updateNudge(nudge.id, "acted_on");
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["trackerNudges"] });
      const result = data as { gmailUrl?: string; composeUrl?: string };
      const url = result.gmailUrl || result.composeUrl;
      if (url) {
        window.open(url, "_blank");
        toast({ title: "Gmail draft created" });
      } else {
        toast({ title: "Nudge marked as acted on" });
      }
    },
    onError: () => toast({ title: "Failed to create draft", variant: "destructive" }),
  });

  // --- bucket computation ---

  const contacts = threadsData || [];

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q)
    );
  }, [contacts, searchQuery]);

  const { needsAttention, waiting, done } = useMemo(() => {
    const na: OutboxThread[] = [];
    const w: OutboxThread[] = [];
    const d: OutboxThread[] = [];
    for (const c of filtered) {
      if (isDone(c)) d.push(c);
      else if (isNeedsAttention(c)) na.push(c);
      else w.push(c);
    }
    // Sort each bucket by lastActivityAt descending
    const byActivity = (a: OutboxThread, b: OutboxThread) =>
      new Date(b.lastActivityAt || 0).getTime() - new Date(a.lastActivityAt || 0).getTime();
    na.sort(byActivity);
    w.sort(byActivity);
    d.sort(byActivity);
    return { needsAttention: na, waiting: w, done: d };
  }, [filtered]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === selectedContactId) || null,
    [contacts, selectedContactId]
  );

  // --- handlers ---

  const handleRefreshAll = () => {
    invalidateAll();
  };

  // --- render ---

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-[#FAFBFF]">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader />
          <main data-tour="tour-track-email" className="flex-1 overflow-hidden flex flex-col">
            {/* Page header */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 bg-white flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">
                    Inbox
                  </h1>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Stay on top of every conversation
                  </p>
                </div>
                <button
                  onClick={handleRefreshAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[3px] bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>
              </div>

              {/* Stats row — use local bucket counts when searching, backend stats otherwise */}
              {(statsData || contacts.length > 0) && (
                <div className="flex items-center gap-4 mt-3 text-sm">
                  <span className={`font-semibold ${(searchQuery ? needsAttention.length : statsData?.needsAttentionCount || 0) > 0 ? "text-orange-600" : "text-gray-500"}`}>
                    {searchQuery ? needsAttention.length : statsData?.needsAttentionCount || 0} Needs Attention
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="text-[#3B82F6] font-medium">
                    {searchQuery ? waiting.length : statsData?.waitingCount || 0} Waiting
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="text-green-600 font-medium">
                    {searchQuery ? done.length : statsData?.doneCount || 0} Done
                  </span>
                  {notifications.unreadReplyCount > 0 && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span className="text-red-600 font-semibold">
                        {notifications.unreadReplyCount} new {notifications.unreadReplyCount === 1 ? "reply" : "replies"}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Main content */}
            {threadsLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : threadsError ? (
              <div className="flex-1 flex items-center justify-center text-sm text-red-500">
                <AlertCircle className="w-4 h-4 mr-2" />
                Failed to load contacts. Please try again.
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">
                {/* Left panel: bucket list */}
                <div
                  className={`border-r border-gray-100 bg-white overflow-y-auto flex-shrink-0 ${
                    selectedContact ? "hidden md:block" : "w-full md:w-auto"
                  }`}
                  style={{ width: selectedContact ? 380 : undefined, minWidth: selectedContact ? 320 : undefined }}
                >
                  <Tabs
                    value={activeTab}
                    onValueChange={(v) => setActiveTab(v as "pipeline" | "queue" | "nudges")}
                    className="flex flex-col h-full"
                  >
                    <div className="px-3 pt-3 border-b border-gray-50">
                      <TabsList className="w-full grid grid-cols-3 h-8 bg-gray-50/80">
                        <TabsTrigger value="pipeline" className="text-xs">Pipeline</TabsTrigger>
                        <TabsTrigger value="queue" className="text-xs">Suggested</TabsTrigger>
                        <TabsTrigger value="nudges" className="text-xs">
                          Nudges
                          {(nudgesData?.length ?? 0) > 0 && (
                            <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#3B82F6] text-white">
                              {nudgesData?.length}
                            </span>
                          )}
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    {/* Pipeline tab */}
                    <TabsContent value="pipeline" className="flex-1 overflow-y-auto m-0">
                      <div className="p-3 border-b border-gray-50">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search contacts..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-100 rounded-[3px] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6]"
                          />
                        </div>
                      </div>
                      <div className="p-2">
                        <TrackerBuckets
                          needsAttention={needsAttention}
                          waiting={waiting}
                          done={done}
                          selectedContactId={selectedContactId}
                          onSelectContact={setSelectedContactId}
                        />
                      </div>
                    </TabsContent>

                    {/* Suggested For You tab — Agentic Queue */}
                    <TabsContent value="queue" className="flex-1 overflow-y-auto m-0">
                      <QueuePanel isActive={activeTab === "queue"} />
                    </TabsContent>

                    {/* Nudges tab */}
                    <TabsContent value="nudges" className="flex-1 overflow-y-auto m-0">
                      {(nudgesData?.length ?? 0) > 0 ? (
                        <div className="px-2 pt-2">
                          <NudgePanel
                            nudges={nudgesData || []}
                            onActOnNudge={(nudge: Nudge) => {
                              nudgeActMutation.mutate(nudge);
                              setSelectedContactId(nudge.contactId);
                              setActiveTab("pipeline");
                            }}
                            onDismissNudge={(nudgeId: string) => nudgeDismissMutation.mutate(nudgeId)}
                            onSelectContact={(id: string) => {
                              setSelectedContactId(id);
                              setActiveTab("pipeline");
                            }}
                          />
                        </div>
                      ) : (
                        <div className="p-6 text-center">
                          <p className="text-sm font-medium text-gray-700">No nudges right now</p>
                          <p className="text-xs text-gray-400 mt-1">
                            We'll nudge you when a contact has gone quiet or needs a follow-up.
                          </p>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Right panel: detail */}
                <div className="flex-1 min-w-0 bg-white">
                  {selectedContact ? (
                    <>
                      {/* Mobile back button */}
                      <button
                        onClick={() => setSelectedContactId(null)}
                        className="md:hidden px-4 py-2 text-sm text-[#3B82F6] font-medium border-b border-gray-100 w-full text-left"
                      >
                        &larr; Back to list
                      </button>
                      <ConversationPanel
                        contact={selectedContact}
                        onStageChange={(id, stage) =>
                          stageChangeMutation.mutate({ contactId: id, stage })
                        }
                        onArchive={(id) => archiveMutation.mutate(id)}
                        onUnarchive={(id) => unarchiveMutation.mutate(id)}
                        onSnooze={(id, until) =>
                          snoozeMutation.mutate({ contactId: id, until })
                        }
                        onMarkWon={(id) => wonMutation.mutate(id)}
                        onMarkRead={(id) => markReadMutation.mutate(id)}
                        onRefresh={(id) => syncMutation.mutate(id)}
                        isSyncing={syncingIds.has(selectedContact.id)}
                        isMutating={mutatingIds.has(selectedContact.id)}
                      />
                    </>
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-gray-400">
                      Select a contact to view details
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
