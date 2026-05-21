import { useState } from "react";
import {
  ChevronDown,
  Zap,
  LogOut,
  Settings,
  Info,
  MessageSquare,
  Shield,
  ScrollText,
  PanelLeft,
  Tag,
  FileText,
  Users,
  Home,
  Repeat,
} from "lucide-react";
import CupIcon from "@/assets/sidebaricons/icons8-cup-48.png";
import MailIcon from "@/assets/sidebaricons/icons8-important-mail-48.png";
import MagnifyingGlassIcon from "@/assets/sidebaricons/icons8-magnifying-glass-50.png";
import BriefcaseIcon from "@/assets/sidebaricons/icons8-briefcase-48.png";

import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { trackNavClick, trackUpgradeClick } from "../lib/analytics";
import { useAgentSidebarStatus } from "@/hooks/useAgent";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ── Icon helpers ────────────────────────────────────────────────────────────

const IMG_FILTER_ACTIVE =
  "brightness(0) saturate(100%) invert(20%) sepia(99%) saturate(2400%) hue-rotate(222deg) brightness(96%) contrast(95%)";
const IMG_FILTER_INACTIVE =
  "brightness(0) saturate(100%) invert(44%) sepia(12%) saturate(560%) hue-rotate(176deg) brightness(94%) contrast(88%)";

type NavItemDef = {
  title: string;
  url: string;
  dataTour?: string;
  newTab?: boolean;
  iconColor?: string; // per-item color for inactive state
  activeColor?: string; // per-item override for active icon/text color
  activeFilter?: string; // per-item override for active img filter
  activeBg?: string; // per-item override for active background
} & (
  | { iconSrc: string; LucideIcon?: never }
  | { LucideIcon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; iconSrc?: never }
);

// CSS filter generators - mid-tone hues tuned for the light sidebar background
const ICON_FILTERS: Record<string, string> = {
  blue:      "brightness(0) saturate(100%) invert(30%) sepia(94%) saturate(1700%) hue-rotate(213deg) brightness(95%) contrast(94%)",
  sky:       "brightness(0) saturate(100%) invert(40%) sepia(70%) saturate(1200%) hue-rotate(180deg) brightness(95%) contrast(92%)",
  indigo:    "brightness(0) saturate(100%) invert(28%) sepia(70%) saturate(1900%) hue-rotate(225deg) brightness(95%) contrast(95%)",
  slate:     "brightness(0) saturate(100%) invert(44%) sepia(12%) saturate(560%) hue-rotate(176deg) brightness(94%) contrast(88%)",
  brown:     "brightness(0) saturate(100%) invert(33%) sepia(40%) saturate(900%) hue-rotate(350deg) brightness(92%) contrast(92%)",
  amber:     "brightness(0) saturate(100%) invert(50%) sepia(92%) saturate(1100%) hue-rotate(2deg) brightness(94%) contrast(94%)",
  emerald:   "brightness(0) saturate(100%) invert(40%) sepia(64%) saturate(1100%) hue-rotate(118deg) brightness(92%) contrast(92%)",
  rose:      "brightness(0) saturate(100%) invert(24%) sepia(82%) saturate(3000%) hue-rotate(331deg) brightness(94%) contrast(95%)",
  violet:    "brightness(0) saturate(100%) invert(28%) sepia(82%) saturate(2200%) hue-rotate(245deg) brightness(95%) contrast(95%)",
  teal:      "brightness(0) saturate(100%) invert(42%) sepia(58%) saturate(900%) hue-rotate(128deg) brightness(92%) contrast(92%)",
};

// Group 1 - main nav (base items, Agent added dynamically for Elite)
const baseNavItems: NavItemDef[] = [
  { title: "Find", url: "/find", iconSrc: MagnifyingGlassIcon, iconColor: "blue" },
  { title: "My Network", url: "/my-network", LucideIcon: Users, iconColor: "#7C3AED" },
  { title: "Meeting Prep", url: "/meeting-prep", iconSrc: CupIcon, iconColor: "amber", dataTour: "tour-meeting-prep" },
  { title: "Tracker", url: "/tracker", iconSrc: MailIcon, iconColor: "rose", dataTour: "tour-track-email" },
  { title: "Job Board", url: "/job-board", iconSrc: BriefcaseIcon, iconColor: "emerald" },
];

// Utility nav - bottom of sidebar
const utilityNavItems: NavItemDef[] = [
  { title: "Pricing", url: "/pricing", LucideIcon: Tag, iconColor: "#D97706" },
  { title: "Documentation", url: "/documentation", LucideIcon: FileText, iconColor: "#0D9488" },
];


// User dropdown menu items
const userMenuItems = [
  { title: "Account Settings", url: "/account-settings", icon: Settings },
  { title: "About Us", url: "/about", icon: Info },
  { title: "Contact Us", url: "/contact-us", icon: MessageSquare },
  { title: "Privacy Policy", url: "/privacy", icon: Shield },
  { title: "Terms of Service", url: "/terms-of-service", icon: ScrollText },
];

// ── Shared nav-item style constants ─────────────────────────────────────────

const NAV_FONT_SIZE = "14px";
const NAV_PY = "11px";
const NAV_GAP = "10px";
const NAV_RADIUS = "8px";

// White sidebar palette
const ACTIVE_BG = "#EFF6FF";
const ACTIVE_SHADOW = "inset 3px 0 0 #2563EB";
const ACTIVE_COLOR = "#1D4ED8";
const INACTIVE_ICON = "#64748B";
const INACTIVE_LABEL = "#475569";
const HOVER_BG = "#F1F5F9";
const HOVER_LABEL = "#0F172A";

// ── Component ───────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { user, signOut } = useFirebaseAuth();

  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const isActive = (url: string) => {
    const basePath = url.split("?")[0];
    return currentPath === basePath || currentPath.startsWith(basePath + "/");
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const credits = user?.credits ?? 0;
  const maxCredits = user?.maxCredits ?? 300;
  const creditPercentage = Math.min((credits / maxCredits) * 100, 100);
  const isCollapsed = state === "collapsed";

  // Launchpad (home) + Loops nav available to all users
  const agentStatus = useAgentSidebarStatus();
  const mainNavItems: NavItemDef[] = [
    { title: "Home", url: "/dashboard", LucideIcon: Home, iconColor: "#2563EB" },
    { title: "Loops", url: "/agent", LucideIcon: Repeat, iconColor: "#4F46E5" },
    ...baseNavItems,
  ];

  // ── Render a single nav item (works for both image-icon and lucide-icon) ──

  const renderNavItem = (item: NavItemDef) => {
    const active = isActive(item.url);

    const inactiveFilter = item.iconColor && ICON_FILTERS[item.iconColor]
      ? ICON_FILTERS[item.iconColor]
      : IMG_FILTER_INACTIVE;

    const icon = item.iconSrc ? (
      <img
        src={item.iconSrc}
        alt=""
        className="h-4 w-4 flex-shrink-0"
        style={{
          filter: active ? (item.activeFilter || IMG_FILTER_ACTIVE) : inactiveFilter,
          opacity: 1,
        }}
      />
    ) : item.LucideIcon ? (
      <item.LucideIcon
        className="h-4 w-4 flex-shrink-0"
        style={{ color: active ? (item.activeColor || ACTIVE_COLOR) : (item.iconColor && !ICON_FILTERS[item.iconColor] ? item.iconColor : INACTIVE_ICON) }}
      />
    ) : null;

    const linkProps = item.newTab
      ? { target: "_blank" as const, rel: "noopener noreferrer" }
      : {};

    if (isCollapsed) {
      return (
        <Tooltip key={item.title}>
          <TooltipTrigger asChild>
            {item.newTab ? (
              <a
                href={item.url}
                {...linkProps}
                data-tour={item.dataTour}
                onClick={() => trackNavClick(item.title, "sidebar")}
                className="flex items-center justify-center rounded-[8px] transition-all"
                style={{
                  padding: NAV_PY,
                  background: "transparent",
                  borderRadius: NAV_RADIUS,
                  textDecoration: "none",
                }}
              >
                {icon}
              </a>
            ) : (
              <NavLink
                to={item.url}
                data-tour={item.dataTour}
                onClick={() => trackNavClick(item.title, "sidebar")}
                className="flex items-center justify-center rounded-[8px] transition-all"
                style={{
                  padding: NAV_PY,
                  background: active ? (item.activeBg || ACTIVE_BG) : "transparent",
                  boxShadow: active ? ACTIVE_SHADOW : "none",
                  borderRadius: NAV_RADIUS,
                }}
              >
                {icon}
              </NavLink>
            )}
          </TooltipTrigger>
          <TooltipContent side="right">{item.title}</TooltipContent>
        </Tooltip>
      );
    }

    if (item.newTab) {
      return (
        <a
          key={item.title}
          href={item.url}
          {...linkProps}
          data-tour={item.dataTour}
          onClick={() => trackNavClick(item.title, "sidebar")}
          className="flex items-center transition-all"
          style={{
            gap: NAV_GAP,
            paddingTop: NAV_PY,
            paddingBottom: NAV_PY,
            paddingLeft: "10px",
            paddingRight: "10px",
            borderRadius: NAV_RADIUS,
            fontSize: NAV_FONT_SIZE,
            fontWeight: 400,
            fontFamily: "var(--font-body)",
            background: "transparent",
            color: INACTIVE_LABEL,
            textDecoration: "none",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = HOVER_BG;
            e.currentTarget.style.color = HOVER_LABEL;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = INACTIVE_LABEL;
          }}
        >
          {icon}
          <span>{item.title}</span>
        </a>
      );
    }

    return (
      <NavLink
        key={item.title}
        to={item.url}
        data-tour={item.dataTour}
        onClick={() => trackNavClick(item.title, "sidebar")}
        className="flex items-center transition-all"
        style={{
          gap: NAV_GAP,
          paddingTop: NAV_PY,
          paddingBottom: NAV_PY,
          paddingLeft: "10px",
          paddingRight: "10px",
          borderRadius: NAV_RADIUS,
          fontSize: NAV_FONT_SIZE,
          fontWeight: active ? 600 : 400,
          fontFamily: "var(--font-body)",
          background: active ? (item.activeBg || ACTIVE_BG) : "transparent",
          boxShadow: active ? ACTIVE_SHADOW : "none",
          color: active ? (item.activeColor || ACTIVE_COLOR) : INACTIVE_LABEL,
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = HOVER_BG;
            e.currentTarget.style.color = HOVER_LABEL;
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = INACTIVE_LABEL;
          }
        }}
      >
        <span className="relative">
          {icon}
          {item.title === "Loops" && agentStatus.status === "active" && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-green-500" />
          )}
          {item.title === "Loops" && agentStatus.status === "paused" && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
          )}
        </span>
        <span className="flex-1">{item.title}</span>
        {item.title === "Loops" && agentStatus.pendingCount > 0 && (
          <span className="ml-auto bg-amber-100 text-amber-700 text-[10px] font-medium rounded-full px-1.5 py-0.5 leading-none">
            {agentStatus.pendingCount}
          </span>
        )}
      </NavLink>
    );
  };

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <Sidebar className={isCollapsed ? "w-16" : "w-64"} collapsible="icon">
        <SidebarContent
          className="flex flex-col h-full overflow-hidden"
          style={{
            background: "#FFFFFF",
            borderRight: "1px solid #E2E8F0",
          }}
        >
          {/* User profile / toggle */}
          <div className="px-3 pt-3 pb-1 flex-shrink-0">
            {isCollapsed ? (
              <div className="flex justify-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleSidebar}
                      className="p-2 rounded-lg transition-colors"
                      style={{ color: "#64748B" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(15,23,42,.05)";
                        e.currentTarget.style.color = "#0F172A";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "#64748B";
                      }}
                      aria-label="Expand sidebar"
                    >
                      <PanelLeft className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Expand sidebar</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                    className="flex-1 flex items-center gap-3 px-2 py-2 rounded-lg transition-all"
                    style={{
                      background: userDropdownOpen ? "rgba(15,23,42,.05)" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(15,23,42,.05)";
                    }}
                    onMouseLeave={(e) => {
                      if (!userDropdownOpen) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0 ring-2 ring-[#3B82F6]/15">
                      {user?.picture && <AvatarImage src={user.picture} alt={user.name} />}
                      <AvatarFallback
                        className="text-xs font-medium"
                        style={{ background: "#DBEAFE", color: "#1D4ED8" }}
                      >
                        {user?.name
                          ?.split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2) ||
                          user?.email?.[0]?.toUpperCase() ||
                          "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-left">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: "#0F172A", fontFamily: "var(--font-body)" }}
                      >
                        {user?.name || "User"}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform flex-shrink-0",
                        userDropdownOpen && "rotate-180"
                      )}
                      style={{ color: "#94A3B8" }}
                    />
                  </button>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={toggleSidebar}
                        className="p-2 rounded-lg transition-colors flex-shrink-0"
                        style={{ color: "#64748B" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(15,23,42,.05)";
                          e.currentTarget.style.color = "#0F172A";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "#64748B";
                        }}
                        aria-label="Collapse sidebar"
                      >
                        <PanelLeft className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Collapse sidebar</TooltipContent>
                  </Tooltip>
                </div>

                {/* Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="mt-1 py-1 bg-white rounded-lg shadow-lg">
                    {userMenuItems.map((item) => (
                      <NavLink
                        key={item.title}
                        to={item.url}
                        onClick={() => {
                          setUserDropdownOpen(false);
                          trackNavClick(item.title, "sidebar_dropdown");
                        }}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                            isActive
                              ? "text-[#1E293B] bg-[rgba(30, 41, 59,0.1)]"
                              : "text-[#475569] hover:text-[#0F172A] hover:bg-[rgba(30, 41, 59,0.06)]"
                          )
                        }
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    ))}
                    <div className="my-1 border-t border-[#E2E8F0]" />
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#475569] hover:text-[#0F172A] hover:bg-[#EFF6FF] transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-3 flex flex-col">
            {/* Group 1 - main */}
            <div className="space-y-0.5">
              {mainNavItems.map(renderNavItem)}
            </div>

            {/* Spacer pushes utility to bottom */}
            <div className="flex-1" />

            {/* Utility nav - bottom */}
            <div className="space-y-0.5">
              {utilityNavItems.map(renderNavItem)}
            </div>
          </nav>
        </SidebarContent>

        {/* Footer - Credits + Upgrade */}
        <SidebarFooter
          className="p-3"
          style={{
            borderTop: "1px solid #E2E8F0",
            background: "#FFFFFF",
          }}
        >
          {!isCollapsed ? (
            <div className="space-y-2.5">
              {/* Credits */}
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1px solid rgba(15,23,42,0.07)",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      color: "#64748B",
                      fontFamily: "var(--font-body)",
                      textTransform: "uppercase" as const,
                    }}
                  >
                    Credits
                  </span>
                  <span style={{ fontFamily: "var(--font-body)", lineHeight: 1 }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#1D4ED8" }}>
                      {credits}
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: 500, color: "#94A3B8" }}>
                      {" "}
                      / {maxCredits}
                    </span>
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "#E6EDF9" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${creditPercentage}%`,
                      background: "linear-gradient(90deg, #3B82F6 0%, #2563EB 100%)",
                    }}
                  />
                </div>
              </div>

              {/* Upgrade button */}
              <button
                onClick={() => {
                  trackUpgradeClick("sidebar", { from_location: "sidebar" });
                  navigate("/pricing");
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-[8px] transition-all"
                style={{
                  background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                  color: "#FFFFFF",
                  fontFamily: "var(--font-body)",
                  fontSize: "14px",
                  fontWeight: 600,
                  border: "none",
                  boxShadow:
                    "0 6px 16px -3px rgba(37,99,235,0.45), inset 0 1px 0 rgba(255,255,255,0.22)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)";
                  e.currentTarget.style.boxShadow =
                    "0 8px 20px -3px rgba(37,99,235,0.55), inset 0 1px 0 rgba(255,255,255,0.22)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 16px -3px rgba(37,99,235,0.45), inset 0 1px 0 rgba(255,255,255,0.22)";
                }}
              >
                <Zap className="h-4 w-4" style={{ color: "#FCD34D", fill: "#FCD34D" }} />
                <span>Upgrade Plan</span>
              </button>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    trackUpgradeClick("sidebar", { from_location: "sidebar" });
                    navigate("/pricing");
                  }}
                  className="w-full flex items-center justify-center p-2.5 rounded-[8px] transition-all"
                  style={{
                    background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                    color: "#FFFFFF",
                    border: "none",
                    boxShadow:
                      "0 6px 16px -3px rgba(37,99,235,0.45), inset 0 1px 0 rgba(255,255,255,0.22)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)";
                  }}
                >
                  <Zap className="h-5 w-5" style={{ color: "#FCD34D", fill: "#FCD34D" }} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="text-xs">
                  <p className="font-medium">
                    Credits: {credits}/{maxCredits}
                  </p>
                  <p className="text-gray-400 mt-0.5">Click to upgrade</p>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  );
}
