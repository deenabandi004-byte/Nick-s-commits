// Curated category rows for the Browse Jobs home (DoorDash-style).
//
// Each category drives one horizontal carousel on the home and, via "See all",
// one Handshake-style filterable grid. Categories map directly onto the
// existing catalog search params (apiService.searchJobs), so no backend work
// is needed. The "recommended" category is special-cased: it reads the
// personalized feed (getJobFeed) instead of the catalog search.
import type { JobSearchParams } from "@/services/api";
import type { LucideIcon } from "lucide-react";
import {
  Star,
  Newspaper,
  GraduationCap,
  Sprout,
  Globe,
  Laptop,
  Landmark,
  BarChart3,
} from "lucide-react";

export interface BrowseCategory {
  key: string;
  label: string;
  // Lucide line icon — house icon system, same as the sidebar. No emojis on
  // this surface (product rule: emoji rows read as AI-generated UI).
  icon: LucideIcon;
  // Catalog-search filter for this row/grid. Ignored when special is set.
  params: Partial<JobSearchParams>;
  // "recommended" pulls from the personalized feed rather than catalog search.
  special?: "recommended";
}

export const BROWSE_CATEGORIES: BrowseCategory[] = [
  { key: "recommended", label: "Recommended for you", icon: Star,          params: {}, special: "recommended" },
  { key: "new-today",   label: "New today",           icon: Newspaper,     params: { postedAfter: "24h" } },
  { key: "internships", label: "Internships",         icon: GraduationCap, params: { type: "INTERNSHIP" } },
  { key: "entry-level", label: "Entry level",         icon: Sprout,        params: { seniority: "entry" } },
  { key: "remote",      label: "Remote",              icon: Globe,         params: { location: "remote" } },
  { key: "tech",        label: "Tech",                icon: Laptop,        params: { q: "software engineer" } },
  { key: "finance",     label: "Finance",             icon: Landmark,      params: { q: "finance analyst" } },
  { key: "consulting",  label: "Consulting",          icon: BarChart3,     params: { q: "consultant" } },
];

// Pills shown in the "Browse" bar — every category except the personalized one
// (which lives only as the top row on the home).
export const BROWSE_PILLS = BROWSE_CATEGORIES.filter((c) => !c.special);
