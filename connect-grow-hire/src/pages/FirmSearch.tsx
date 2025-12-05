/**
 * FirmSearch.tsx - Company/Firm Discovery Page (WITH TABS)
 * 
 * Tab 1: Firm Search - Natural language search for firms
 * Tab 2: Firm Sheet - Spreadsheet-style table with results and CSV export
 * 
 * IMPORTANT: Firm search results are saved to Firebase and persist across sessions
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Search, Building2, History, Loader2, AlertCircle, Sparkles, Download, Sheet } from 'lucide-react';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';
import { searchFirms, getFirmSearchHistory, getFirmSearchById, type Firm, type FirmSearchResult, type SearchHistoryItem } from '../services/api';
import { logActivity, generateFirmSearchSummary } from '../utils/activityLogger';
import FirmSearchResults from '../components/FirmSearchResults';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { BackToHomeButton } from '@/components/BackToHomeButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import ScoutChatbot from '@/components/ScoutChatbot';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';

// Example prompts to show users
const EXAMPLE_PROMPTS = [
  "Investment banks in New York focused on healthcare M&A",
  "Mid-sized consulting firms in San Francisco",
  "Venture capital firms in Boston focused on biotech",
  "Large private equity firms in Chicago",
  "Software companies in Austin with 50-200 employees"
];

// Background Blobs Component
function BackgroundBlobs() {
  return (
    <>
      <motion.div
        className="absolute -top-32 left-10 w-80 h-80 rounded-full bg-purple-500/20 blur-3xl pointer-events-none"
        animate={{ 
          y: [0, 20, 0], 
          scale: [1, 1.05, 1],
          x: [0, 10, 0]
        }}
        transition={{ 
          duration: 12, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        style={{ zIndex: 0 }}
      />
      <motion.div
        className="absolute -bottom-40 right-0 w-96 h-96 rounded-full bg-pink-500/20 blur-3xl pointer-events-none"
        animate={{ 
          y: [0, -20, 0], 
          scale: [1, 1.04, 1],
          x: [0, -10, 0]
        }}
        transition={{ 
          duration: 14, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        style={{ zIndex: 0 }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-purple-500/10 blur-3xl pointer-events-none"
        animate={{ 
          scale: [1, 1.1, 1],
          opacity: [0.1, 0.15, 0.1]
        }}
        transition={{ 
          duration: 16, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
        style={{ zIndex: 0 }}
      />
    </>
  );
}

// Batch Size Segmented Control Component
function BatchSizeSegmentedControl({
  value,
  onChange,
  options,
  disabled,
}: {
  value: number;
  onChange: (val: number) => void;
  options: number[];
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-muted p-1 border border-border relative">
      {/* Animated background indicator */}
      <AnimatePresence mode="wait">
        <motion.div
          key={value}
          className="absolute bg-primary rounded-full"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          style={{
            left: `${options.indexOf(value) * (100 / options.length)}%`,
            width: `${100 / options.length}%`,
            height: 'calc(100% - 2px)',
            top: '1px',
          }}
        />
      </AnimatePresence>
      
      {options.map((option) => {
        const isActive = option === value;
        return (
          <motion.button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            disabled={disabled}
            whileHover={!disabled ? { scale: 1.05 } : {}}
            whileTap={!disabled ? { scale: 0.95 } : {}}
            className={[
              "relative px-3 py-1.5 text-xs font-medium rounded-full transition z-10",
              isActive
                ? "text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
              disabled && "opacity-50 cursor-not-allowed",
            ].join(" ")}
          >
            {option}
          </motion.button>
        );
      })}
    </div>
  );
}

export default function FirmSearch() {
  const navigate = useNavigate();
  const { user, checkCredits } = useFirebaseAuth();
  const { toast } = useToast();
  
  // Search state
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [results, setResults] = useState<Firm[]>([]);
  const [parsedFilters, setParsedFilters] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [buttonGlow, setButtonGlow] = useState(false);
  
  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState('search');
  
  // Loading state for saved firms
  const [loadingSavedFirms, setLoadingSavedFirms] = useState(true);
  
  // Credit system state
  const [batchSize, setBatchSize] = useState<number>(10);
  const [batchOptions] = useState<number[]>([5, 10, 20, 40]); // Fixed options: 5, 10, 20, 40
  const [creditsPerFirm] = useState<number>(5);
  const [loadingBatchOptions] = useState(false); // No longer loading from API
  
  // Load all saved firms from Firebase on mount
  const loadAllSavedFirms = useCallback(async () => {
    if (!user) {
      setLoadingSavedFirms(false);
      return;
    }
    
    setLoadingSavedFirms(true);
    try {
      console.log('📥 Loading all saved firms from Firebase...');
      const history = await getFirmSearchHistory(50); // Get more history items
      
      // Extract all unique firms from all searches
      const allFirms: Firm[] = [];
      const firmIds = new Set<string>();
      
      for (const historyItem of history) {
        try {
          // Fetch the full search data to get the firms
          const searchData = await getFirmSearchById(historyItem.id);
          if (searchData && searchData.results) {
            searchData.results.forEach((firm: Firm) => {
              // Use firm ID or name+location as unique key
              const firmKey = firm.id || `${firm.name}-${firm.location?.display}`;
              if (!firmIds.has(firmKey)) {
                firmIds.add(firmKey);
                allFirms.push(firm);
              }
            });
          }
        } catch (err) {
          console.error(`Failed to load search ${historyItem.id}:`, err);
        }
      }
      
      console.log(`✅ Loaded ${allFirms.length} unique firms from Firebase`);
      setResults(allFirms);
    } catch (err) {
      console.error('❌ Failed to load saved firms:', err);
    } finally {
      setLoadingSavedFirms(false);
    }
  }, [user]);
  
  // Load search history
  const loadHistory = useCallback(async () => {
    if (!user) return;
    
    setLoadingHistory(true);
    try {
      const history = await getFirmSearchHistory(10);
      setSearchHistory(history);
    } catch (err) {
      console.error('Failed to load search history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [user]);
  
  // Batch options are now fixed at [5, 10, 20, 40] - no longer loading from API
  
  // Load saved firms and history on mount
  useEffect(() => {
    loadAllSavedFirms();
    loadHistory();
  }, [loadAllSavedFirms, loadHistory]);
  
  // Handle search submission
  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery || query;
    
    if (!q.trim()) {
      setError('Please enter a search query');
      return;
    }
    
    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    setSearchProgress(0);
    setLoadingMessage('Starting your search...');

    // Progress simulation with encouraging messages
    const progressMessages = [
      { progress: 10, message: 'Looking around...' },
      { progress: 25, message: 'Finding the right firms...' },
      { progress: 40, message: 'Searching company databases...' },
      { progress: 60, message: 'Almost there...' },
      { progress: 80, message: 'Finalizing results...' },
      { progress: 95, message: 'Just a moment more...' },
    ];

    let currentMessageIndex = 0;
    let progressInterval: NodeJS.Timeout | null = null;
    
    progressInterval = setInterval(() => {
      if (currentMessageIndex < progressMessages.length) {
        const { progress, message } = progressMessages[currentMessageIndex];
        setSearchProgress(progress);
        setLoadingMessage(message);
        currentMessageIndex++;
      } else {
        setSearchProgress(prev => {
          if (prev < 95) return prev + 5;
          return prev;
        });
      }
    }, 800);
    
    try {
      const result: FirmSearchResult = await searchFirms(q, batchSize);
      
      // Complete progress
      if (progressInterval) clearInterval(progressInterval);
      setSearchProgress(100);
      setLoadingMessage('Done!');
      
      if (result.success) {
        setParsedFilters(result.parsedFilters);
        
        if (result.firms.length === 0) {
          setError('No firms found matching your criteria. Try broadening your search or adjusting the location/industry.');
        } else {
          // Merge new firms with existing ones (avoid duplicates)
          const existingFirmKeys = new Set(
            results.map(f => f.id || `${f.name}-${f.location?.display}`)
          );
          
          const newFirms = result.firms.filter(firm => {
            const firmKey = firm.id || `${firm.name}-${firm.location?.display}`;
            return !existingFirmKeys.has(firmKey);
          });
          
          setResults(prev => [...newFirms, ...prev]);
          
          // Log activity for firm search
          if (user?.uid && result.firms.length > 0) {
            try {
              const searchParams = result.parsedFilters || {};
              const summary = await generateFirmSearchSummary(searchParams, result.firms.length);
              await logActivity(user.uid, 'firmSearch', summary, {
                query: q,
                parsedFilters: result.parsedFilters,
                numberOfFirms: result.firms.length,
              });
            } catch (error) {
              console.error('Failed to log firm search activity:', error);
            }
          }
          
          // Show success toast with credit info
          toast({
            title: "Search Complete!",
            description: `Found ${result.firms.length} firms. Used ${result.creditsCharged || 0} credits.`,
          });
          
          // Update user credits
          await checkCredits();
          
          // Auto-switch to Firm Sheet tab when results come in
          setActiveTab('sheet');
        }
        
        // Refresh history after successful search
        loadHistory();
      } else if (result.insufficientCredits) {
        // Handle insufficient credits error
        setError(result.error || 'Insufficient credits');
        toast({
          title: "Insufficient Credits",
          description: `You need ${result.creditsNeeded} credits but only have ${result.currentCredits}. Please upgrade your plan or reduce batch size.`,
          variant: "destructive",
        });
      } else {
        setError(result.error || 'Search failed. Please try again.');
      }
    } catch (err: any) {
      if (progressInterval) clearInterval(progressInterval);
      setSearchProgress(0);
      setLoadingMessage('');
      console.error('Search error:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
      toast({
        title: "Search Failed",
        description: err.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
      setTimeout(() => {
        setSearchProgress(0);
        setLoadingMessage('');
      }, 500);
    }
  };
  
  // Handle "View Contacts" - navigate to contact search with company/location pre-filled
  const handleViewContacts = (firm: Firm) => {
    const params = new URLSearchParams();
    params.set('company', firm.name);
    
    // Use the display location
    if (firm.location?.display) {
      params.set('location', firm.location.display);
    } else if (firm.location?.city) {
      const locationParts = [firm.location.city, firm.location.state, firm.location.country].filter(Boolean);
      params.set('location', locationParts.join(', '));
    }
    
    navigate(`/contact-search?${params.toString()}`);
  };
  
  // Handle clicking a history item
  const handleHistoryClick = (item: SearchHistoryItem) => {
    setQuery(item.query);
    setShowHistory(false);
    handleSearch(item.query);
  };
  
  // Handle example prompt click
  const handleExampleClick = (prompt: string) => {
    setQuery(prompt);
    handleSearch(prompt);
  };
  
  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  // CSV Export function for Firm Sheet
  const handleExportCsv = () => {
    if (!results || results.length === 0) {
      return;
    }

    // Define CSV headers
    const headers = [
      'Company Name',
      'Website',
      'LinkedIn',
      'Location',
      'Industry',
      'Employees'
    ] as const;

    const headerRow = headers.join(',');

    // Map firms to CSV rows
    const rows = results.map((firm) => {
      const escapeCsv = (val: string | undefined | null) => {
        if (!val) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const location = firm.location?.display || 
                      [firm.location?.city, firm.location?.state, firm.location?.country]
                        .filter(Boolean)
                        .join(', ');

      return [
        escapeCsv(firm.name),
        escapeCsv(firm.website),
        escapeCsv(firm.linkedinUrl),
        escapeCsv(location),
        escapeCsv(firm.industry),
        escapeCsv(firm.employeeCount?.toString())
      ].join(',');
    });

    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `firms_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Header with Back Button and Sidebar Toggle */}
          <div className="bg-background border-b border-border">
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <BackToHomeButton />
              </div>
              <div className="flex items-center">
                <ThemeToggle />
              </div>
            </div>
          </div>
          
          {/* Main Content Area */}
          <div className="flex-1">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex justify-center mb-8">
                  <TabsList className="relative grid w-full grid-cols-2 max-w-lg bg-muted border border-border p-1 rounded-xl h-14 overflow-hidden">
                    {/* Animated sliding background */}
                    <motion.div
                      className="absolute bg-gradient-to-r from-pink-500 to-purple-500 rounded-lg h-12"
                      initial={false}
                      animate={{ 
                        left: activeTab === 'search' ? '4px' : '50%',
                        width: 'calc(50% - 4px)'
                      }}
                      transition={{ 
                        type: "spring", 
                        stiffness: 400, 
                        damping: 30 
                      }}
                      style={{ top: '4px' }}
                    />
                    
                    <TabsTrigger 
                      value="search" 
                      className="relative z-10 gap-2 h-12 text-base font-medium data-[state=active]:bg-transparent data-[state=active]:text-white [data-theme=light]:data-[state=active]:text-black data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground transition-all"
                    >
                      <motion.div
                        whileHover={{ y: activeTab === 'search' ? 0 : -1 }}
                        className="flex items-center gap-2"
                      >
                        <Search className="h-5 w-5" />
                        Firm Search
                      </motion.div>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="sheet" 
                      className="relative z-10 gap-2 h-12 text-base font-medium data-[state=active]:bg-transparent data-[state=active]:text-white [data-theme=light]:data-[state=active]:text-black data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground transition-all"
                    >
                      <motion.div
                        whileHover={{ y: activeTab === 'sheet' ? 0 : -1 }}
                        className="flex items-center gap-2"
                      >
                        <Sheet className="h-5 w-5" />
                        Firm Sheet ({results.length})
                      </motion.div>
                    </TabsTrigger>
                  </TabsList>
                </div>
                
                {/* TAB 1: Firm Search */}
                <TabsContent value="search">
                  <div className="mx-auto max-w-5xl px-6 py-12 space-y-10 relative">
                    {/* Animated Background Blobs */}
                    <BackgroundBlobs />
                    
                    {/* Left-aligned Header */}
                    <motion.div 
                      className="space-y-2 relative z-10"
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5 }}
                    >
                      <h1 className="text-3xl font-semibold text-foreground">Firm Search</h1>
                      <p className="text-sm text-muted-foreground">
                        Discover companies that match your career interests.
                      </p>
                    </motion.div>

                    {/* Main Card */}
                    <motion.div 
                      className="rounded-2xl bg-card border border-border p-8 space-y-6 shadow-lg relative z-10"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.1 }}
                    >
                      {/* Description Input Section */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Describe the firms you're looking for
                          </label>
                          
                          {/* History Toggle */}
                          <button
                            onClick={() => setShowHistory(!showHistory)}
                            className="flex items-center space-x-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                          >
                            <History className="h-4 w-4" />
                            <span>History</span>
                          </button>
                        </div>
                        
                        <div className="relative">
                          <textarea
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="e.g., Mid-sized investment banks in New York focused on healthcare M&A..."
                            rows={4}
                            className="min-h-[120px] w-full rounded-xl bg-muted border border-border px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent resize-none disabled:opacity-50"
                            disabled={isSearching}
                          />
                          
                          <button
                            onClick={() => handleSearch()}
                            disabled={isSearching || !query.trim()}
                            className="absolute bottom-3 right-3 p-2 bg-transparent dark:bg-white rounded-full hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isSearching ? (
                              <Loader2 className="h-5 w-5 animate-spin text-foreground" />
                            ) : (
                              <ArrowUp className="h-5 w-5 text-black dark:text-black" />
                            )}
                          </button>
                        </div>
                        
                        <p className="text-xs text-muted-foreground">
                          Include <span className="text-red-500">*</span>industry<span className="text-red-500">*</span> (required), <span className="text-red-500">*</span>location<span className="text-red-500">*</span> (required), and optionally size, focus areas, and any key words you want for best results.
                        </p>
                      </div>

                      {/* Batch Size Section */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-border">
                        <div className="space-y-1">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Firm Batch Size
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Choose how many firms to pull per search.
                          </p>
                        </div>

                        <div className="flex items-center gap-4">
                          <BatchSizeSegmentedControl
                            value={batchSize}
                            onChange={(val) => setBatchSize(val)}
                            options={batchOptions}
                            disabled={isSearching || loadingBatchOptions}
                          />
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <motion.div 
                                  className="text-right text-xs text-muted-foreground cursor-help"
                                  key={batchSize * creditsPerFirm}
                                  initial={{ scale: 1 }}
                                  animate={{ scale: [1, 1.05, 1] }}
                                  transition={{ duration: 0.3 }}
                                >
                                  <div className="font-medium text-foreground">
                                    {batchSize * creditsPerFirm} credits
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">
                                    {creditsPerFirm} credits per firm
                                  </div>
                                </motion.div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">
                                  Each firm = {creditsPerFirm} credits
                                  {user && user.credits !== undefined && (
                                    <span className="block mt-1">
                                      You can search {Math.floor(user.credits / creditsPerFirm)} more firm{Math.floor(user.credits / creditsPerFirm) !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>

                      {/* Insufficient Credits Warning */}
                      {user && user.credits !== undefined && user.credits < (batchSize * creditsPerFirm) && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                          <p className="text-xs text-red-400 flex items-start gap-2">
                            <span>⚠️ Warning:</span>
                            <span>Insufficient credits. You need {batchSize * creditsPerFirm} credits but only have {user.credits}.</span>
                          </p>
                        </div>
                      )}

                      {/* Progress Bar */}
                      {isSearching && (
                        <div className="space-y-2">
                          <div className="w-full bg-background rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300 ease-out"
                              style={{ width: `${searchProgress}%` }}
                            />
                          </div>
                          {loadingMessage && (
                            <p className="text-xs text-center text-muted-foreground animate-pulse">
                              {loadingMessage}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Search Button */}
                      <motion.div
                        className="relative"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <AnimatePresence>
                          {buttonGlow && (
                            <motion.div
                              className="absolute inset-0 rounded-xl bg-primary/50 blur-xl -z-10"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: [0, 0.6, 0], scale: [0.8, 1.3, 1.5] }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.6 }}
                              onAnimationComplete={() => setButtonGlow(false)}
                            />
                          )}
                        </AnimatePresence>
                        <Button
                          onClick={() => {
                            setButtonGlow(true);
                            handleSearch();
                          }}
                          disabled={isSearching || !query.trim()}
                          className="relative mt-2 h-12 w-full rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSearching ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              {loadingMessage || 'Searching...'}
                            </>
                          ) : (
                            'Search Firms'
                          )}
                        </Button>
                      </motion.div>
                    </motion.div>

                    {/* Examples Section */}
                    <AnimatePresence>
                      {!hasSearched && (
                        <motion.section 
                          className="space-y-3 relative z-10"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.4, delay: 0.2 }}
                        >
                          <h3 className="text-sm font-medium text-foreground/70">
                            Examples you can try
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            Click an example to fill in the search description.
                          </p>
                          <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
                            {EXAMPLE_PROMPTS.map((example, index) => (
                              <motion.button
                                key={index}
                                type="button"
                                onClick={() => handleExampleClick(example)}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ 
                                  duration: 0.3, 
                                  delay: 0.3 + (index * 0.1),
                                  ease: "easeOut"
                                }}
                                whileHover={{ 
                                  y: -2, 
                                  scale: 1.02,
                                  transition: { duration: 0.2 }
                                }}
                                whileTap={{ scale: 0.98 }}
                                className="whitespace-nowrap rounded-full border border-border bg-muted px-3 py-1.5 text-xs text-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
                              >
                                {example}
                              </motion.button>
                            ))}
                          </div>
                        </motion.section>
                      )}
                    </AnimatePresence>
                    
                    {/* Error Message */}
                    {error && (
                      <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-lg flex items-start space-x-3">
                        <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-red-200">{error}</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Parsed Filters Display */}
                    {parsedFilters && hasSearched && !error && (
                      <div className="p-4 bg-blue-900/30 border border-blue-500/50 rounded-lg">
                        <p className="text-sm text-blue-200">
                          <span className="font-medium">Searching for:</span>{' '}
                          {parsedFilters.size && parsedFilters.size !== 'none' && (
                            <span className="capitalize">{parsedFilters.size}-sized </span>
                          )}
                          <span className="capitalize">{parsedFilters.industry}</span> firms in{' '}
                          <span>{parsedFilters.location}</span>
                          {parsedFilters.keywords?.length > 0 && (
                            <span> focused on {parsedFilters.keywords.join(', ')}</span>
                          )}
                        </p>
                      </div>
                    )}
                    
                    {/* Loading State */}
                    <AnimatePresence>
                      {isSearching && (
                        <motion.div 
                          className="bg-card backdrop-blur-sm rounded-xl shadow-sm border border-border p-12 text-center relative z-10"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.3 }}
                        >
                          <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
                          <p className="text-foreground">Searching for matching firms...</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    {/* Success Message */}
                    <AnimatePresence>
                      {hasSearched && !isSearching && results.length > 0 && (
                        <motion.div 
                          className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 relative z-10"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <p className="text-green-400">
                            <span className="font-medium">✓ Found {results.length} firms!</span> Switch to the "Firm Sheet" tab to view results and export to CSV.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </TabsContent>
                
                {/* TAB 2: Firm Sheet */}
                <TabsContent value="sheet">
                  <div className="space-y-4 flex flex-col items-center">
                    {/* Export CSV Button */}
                    {results.length > 0 && (
                      <div className="flex justify-between items-center bg-card backdrop-blur-sm rounded-lg shadow-sm border border-border p-4 w-full max-w-7xl">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {results.length} firm{results.length !== 1 ? 's' : ''} saved
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Export your results to CSV for further analysis
                          </p>
                        </div>
                        <Button 
                          onClick={handleExportCsv} 
                          className="gap-2 bg-blue-600 hover:bg-blue-700"
                        >
                          <Download className="h-4 w-4" />
                          Export CSV
                        </Button>
                      </div>
                    )}
                    
                    {/* Loading State */}
                    <AnimatePresence mode="wait">
                      {loadingSavedFirms ? (
                        <motion.div 
                          key="loading"
                          className="bg-card backdrop-blur-sm rounded-xl shadow-sm border border-border p-12 text-center"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
                          <p className="text-foreground">Loading your saved firms...</p>
                        </motion.div>
                      ) : results.length > 0 ? (
                        /* Results Table */
                        <motion.div
                          key="results"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.4 }}
                          className="w-full"
                        >
                          <FirmSearchResults 
                            firms={results} 
                            onViewContacts={handleViewContacts}
                          />
                        </motion.div>
                      ) : (
                        /* Empty State */
                        <motion.div 
                          key="empty"
                          className="bg-card backdrop-blur-sm rounded-xl shadow-sm border border-border p-12 text-center"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <Sheet className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                          <p className="text-foreground mb-2">No firms to display yet</p>
                          <p className="text-sm text-muted-foreground">
                            Switch to the "Firm Search" tab to find companies
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
        
        {/* Search History Sidebar */}
        {showHistory && (
          <>
            <div className="fixed inset-y-0 right-0 w-96 bg-card shadow-xl border-l border-border z-50">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Search History</h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent"
                >
                  ✕
                </button>
              </div>
              
              <div className="overflow-y-auto h-full pb-20">
                {loadingHistory ? (
                  <div className="p-8 text-center">
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin mx-auto" />
                  </div>
                ) : searchHistory.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No search history yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-700">
                    {searchHistory.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleHistoryClick(item)}
                        className="w-full p-4 text-left hover:bg-gray-700 transition-colors"
                      >
                        <p className="text-sm font-medium text-white line-clamp-2">
                          {item.query}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-400">
                            {item.resultsCount} firms found
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Overlay for history sidebar */}
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 z-40"
              onClick={() => setShowHistory(false)}
            />
          </>
        )}
        <ScoutChatbot onJobTitleSuggestion={() => {}} />
      </div>
    </SidebarProvider>
  );
}
