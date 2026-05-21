import React, { useState, useEffect, useRef } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Building2, MapPin, Clock, DollarSign, Users, ExternalLink, Bookmark, BookmarkCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { apiService, type Job } from "@/services/api";
import { firebaseApi } from "@/services/firebaseApi";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { GlassCard } from "./GlassCard";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { cn } from "@/lib/utils";

interface UserPreferences {
  jobTypes: string[];
  industries: string[];
  locations: string[];
}

const MatchScoreBadge: React.FC<{ score?: number }> = ({ score }) => {
  if (!score && score !== 0) return null;
  
  let color = "bg-gray-100 text-gray-600";
  let label = "Match";
  
  if (score >= 80) {
    color = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    label = "Great Match";
  } else if (score >= 60) {
    color = "bg-[rgba(59,130,246,0.10)] text-[#2563EB] dark:bg-[rgba(59,130,246,0.10)] dark:text-[#3B82F6]";
    label = "Good Match";
  } else if (score >= 40) {
    color = "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    label = "Fair Match";
  }
  
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${color}`}>
      {label} • {Math.round(score)}%
    </span>
  );
};

const JobCard: React.FC<{
  job: Job;
  isSaved: boolean;
  onSelect: () => void;
  onSave: () => void;
  onApply: () => void;
}> = ({ job, isSaved, onSelect, onSave, onApply }) => (
  <GlassCard className="p-5 cursor-pointer transition-all duration-300 hover:scale-[1.02]">
    <div className="flex items-start justify-between gap-4">
      <div className="flex-shrink-0">
        {job.logo ? (
          <img
            src={job.logo}
            alt={job.company}
            className="w-12 h-12 rounded-[3px] object-cover bg-muted"
          />
        ) : (
          <div className="w-12 h-12 rounded-[3px] bg-[#EFF6FF] flex items-center justify-center">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{job.title}</h3>
            <p className="text-sm text-muted-foreground">{job.company}</p>
            {job.matchScore !== undefined && (
              <div className="mt-2">
                <MatchScoreBadge score={job.matchScore} />
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onSave(); }}
            className="flex-shrink-0 p-1.5 rounded-full hover:bg-muted/50 transition-colors"
          >
            {isSaved ? (
              <BookmarkCheck className="w-5 h-5 text-primary" />
            ) : (
              <Bookmark className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <Badge variant="secondary" className="text-xs">
            <MapPin className="w-3 h-3 mr-1" />
            {job.location}
          </Badge>
          <Badge variant={job.type === "Internship" ? "default" : "outline"} className="text-xs">
            {job.type}
          </Badge>
          {job.remote && (
            <Badge variant="outline" className="text-xs text-green-600">Remote</Badge>
          )}
          {job.salary && (
            <Badge variant="outline" className="text-xs">
              <DollarSign className="w-3 h-3 mr-1" />
              {job.salary}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {job.posted}
          </span>
          {job.via && <span>{job.via}</span>}
        </div>
      </div>
    </div>

    <div className="flex gap-2 mt-4 pt-4 border-t border-border/50">
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
      >
        <Users className="w-4 h-4 mr-2" />
        Optimize
      </Button>
      <Button
        variant="gradient"
        size="sm"
        className="flex-1"
        onClick={(e) => { e.stopPropagation(); onApply(); }}
      >
        <ExternalLink className="w-4 h-4 mr-2" />
        Apply
      </Button>
    </div>
  </GlassCard>
);

export const RecommendedJobs: React.FC = () => {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Fetch user preferences
  useEffect(() => {
    const fetchUserPreferences = async () => {
      if (!user?.uid) return;
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const professionalInfo = userData.professionalInfo || {};
          
          const jobTypes = userData.jobTypes || professionalInfo.jobTypes || ["Internship"];
          const industries = professionalInfo.targetIndustries || userData.targetIndustries || [];
          const locations = userData.locationPreferences || professionalInfo.locationPreferences || userData.preferredLocation || [];
          
          setUserPreferences({
            jobTypes: Array.isArray(jobTypes) ? jobTypes : [jobTypes].filter(Boolean),
            industries: Array.isArray(industries) ? industries : [],
            locations: Array.isArray(locations) ? locations : [],
          });
        } else {
          const professionalInfo = await firebaseApi.getProfessionalInfo(user.uid);
          if (professionalInfo) {
            setUserPreferences({
              jobTypes: ["Internship"],
              industries: professionalInfo.targetIndustries || [],
              locations: [],
            });
          }
        }
      } catch (error) {
        console.error("Error fetching user preferences:", error);
        setUserPreferences({
          jobTypes: ["Internship"],
          industries: [],
          locations: [],
        });
      }
    };
    fetchUserPreferences();
  }, [user?.uid]);

  // Load saved jobs from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("offerloop_saved_jobs");
    if (saved) setSavedJobs(new Set(JSON.parse(saved)));
  }, []);

  // Fetch jobs
  useEffect(() => {
    const fetchJobs = async () => {
      if (!user?.uid || !userPreferences) return;
      setLoading(true);
      try {
        const response = await apiService.getJobListings({
          jobTypes: userPreferences.jobTypes || ["Internship"],
          industries: userPreferences.industries || [],
          locations: userPreferences.locations || [],
          page: 1,
          perPage: 200,
        });
        
        if (response.jobs && response.jobs.length > 0) {
          // Sort by match score (Best Match) and take top 10
          const sortedJobs = [...response.jobs].sort((a, b) => {
            const scoreA = a.matchScore ?? 0;
            const scoreB = b.matchScore ?? 0;
            return scoreB - scoreA;
          });
          
          setJobs(sortedJobs.slice(0, 10));
        }
      } catch (error) {
        console.error("Error fetching recommended jobs:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchJobs();
  }, [user?.uid, userPreferences]);

  // Check scroll position
  useEffect(() => {
    const checkScroll = () => {
      if (!scrollContainerRef.current) return;
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    };

    const container = scrollContainerRef.current;
    if (container) {
      checkScroll();
      container.addEventListener("scroll", checkScroll);
      window.addEventListener("resize", checkScroll);
      return () => {
        container.removeEventListener("scroll", checkScroll);
        window.removeEventListener("resize", checkScroll);
      };
    }
  }, [jobs]);

  const scroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const cardWidth = container.querySelector(".job-card")?.clientWidth || 400;
    const scrollAmount = cardWidth + 16; // card width + gap
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const handleSaveJob = (jobId: string) => {
    setSavedJobs((prev) => {
      const newSaved = new Set(prev);
      if (newSaved.has(jobId)) {
        newSaved.delete(jobId);
      } else {
        newSaved.add(jobId);
      }
      localStorage.setItem("offerloop_saved_jobs", JSON.stringify([...newSaved]));
      return newSaved;
    });
  };

  const handleSelectJob = (job: Job) => {
    // Navigate to job board optimize tab
    navigate(`/job-board?tab=optimize`);
  };

  const handleApplyToJob = (job: Job) => {
    window.open(job.url, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <div className="pt-4 min-w-0 w-full overflow-x-hidden">
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg text-foreground">Recommended Jobs</h3>
          </div>
          <button
            onClick={() => navigate("/job-board")}
            className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            View All
          </button>
        </div>
        <div className="mb-2">
          <p className="text-sm text-muted-foreground">Loading recommended jobs...</p>
        </div>
        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 min-w-0">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[85vw] sm:w-[400px] md:w-[380px] max-w-full">
              <LoadingSkeleton />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (jobs.length === 0) {
    return null;
  }

  return (
    <div className="pt-4 min-w-0 w-full overflow-x-hidden">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg text-foreground">Recommended Jobs</h3>
        </div>
        <button
          onClick={() => navigate("/job-board")}
          className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          View All
        </button>
      </div>

      <div className="relative min-w-0 w-full">
        {/* Left scroll button */}
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-background/90 backdrop-blur-sm border border-border rounded-full p-2 shadow-lg hover:bg-background transition-colors hidden md:block"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
        )}

        {/* Scrollable container */}
        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 scroll-smooth min-w-0"
          style={{
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {jobs.map((job) => (
            <div
              key={job.id}
              className="job-card flex-shrink-0 w-[85vw] sm:w-[400px] md:w-[380px] max-w-full"
              style={{ scrollSnapAlign: "start" }}
            >
              <JobCard
                job={job}
                isSaved={savedJobs.has(job.id)}
                onSelect={() => handleSelectJob(job)}
                onSave={() => handleSaveJob(job.id)}
                onApply={() => handleApplyToJob(job)}
              />
            </div>
          ))}
          {/* View All button at end of carousel */}
          <div className="flex-shrink-0 flex items-center pr-4">
            <button
              onClick={() => navigate("/job-board")}
              className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors whitespace-nowrap px-4 py-2 rounded-[3px] border border-primary/20 hover:border-primary/40 hover:bg-primary/5"
            >
              View All
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right scroll button */}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-background/90 backdrop-blur-sm border border-border rounded-full p-2 shadow-lg hover:bg-background transition-colors hidden md:block"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5 text-foreground" />
          </button>
        )}
      </div>

      {/* Scroll indicator dots */}
      {jobs.length > 3 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {Array.from({ length: Math.ceil(jobs.length / 3) }).map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30"
            />
          ))}
        </div>
      )}
    </div>
  );
};

