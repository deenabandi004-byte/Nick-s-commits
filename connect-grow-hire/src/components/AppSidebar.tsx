import { useState } from "react";
import {
  Home,
  User,
  Zap,
  Info,
  Settings,
  CreditCard,
  ChevronRight,
  ChevronDown,
  Search,
  Coffee,
  Building2,
  Briefcase,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import OfferloopLogo from "../assets/Offerloop-topleft.jpeg";
import LightModeLogo from "../assets/Light_Mode_Logo.png";
import DarkModeLogo from "../assets/darkmodelogo.png";
import OfferloopIcon from "../assets/icon.png";
import SmushedSidebarLogoWhite from "../assets/smushedsidebarlogowhite.png";
import LightningIcon from "../assets/Lightning.png";
import CrownIcon from "../assets/Crown_icon.png";
import CrownIconDark from "../assets/Crown_icon_dark.png";
import { useFirebaseAuth } from "../contexts/FirebaseAuthContext";
import { useTheme } from "../contexts/ThemeContext";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navigationItems = [
  { title: "Home", url: "/home", icon: Home },
  { title: "Firm Search", url: "/firm-search", icon: Building2 },
  { title: "Contact Search", url: "/contact-search", icon: Search },
  { title: "Coffee Chat Prep", url: "/coffee-chat-prep", icon: Coffee },
  { title: "Interview Prep", url: "/interview-prep", icon: Briefcase },
  { title: "Pricing", url: "/pricing", icon: CreditCard },
];

const settingsItems = [
  { title: "Account Settings", url: "/account-settings", icon: User },
  { title: "About Us", url: "/about", icon: Info },
  { title: "Contact Us", url: "/contact-us", icon: User },
  { title: "Privacy Policy", url: "/privacy", icon: User },
  { title: "Terms of Service", url: "/terms-of-service", icon: User },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const { user } = useFirebaseAuth();
  const { theme } = useTheme();

  const isActive = (path: string) => currentPath === path;
  const isSettingsActive = settingsItems.some((item) => isActive(item.url));

  const getNavClass = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? "bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent-solid))] font-medium"
      : "hover:bg-[hsl(var(--bg-secondary))] text-muted-foreground hover:text-foreground";

  const getSettingsClass = () =>
    isSettingsActive
      ? "bg-primary text-primary-foreground font-medium"
      : "hover:bg-[hsl(var(--bg-secondary))] text-muted-foreground hover:text-foreground";

  // Status message for collapsed tooltip
  const getCreditStatus = () => {
    const credits = user?.credits ?? 0;
    if (credits === 0)
      return {
        color: "text-red-500",
        message: "No credits remaining!",
      };
    if (credits < 30)
      return {
        color: "text-amber-500",
        message: `Only ${Math.floor(credits / 15)} searches left`,
      };
    if (credits < 60)
      return {
        color: "text-yellow-500",
        message: `${Math.floor(credits / 15)} searches available`,
      };
    return {
      color: "text-emerald-500",
      message: `${Math.floor(credits / 15)} searches available`,
    };
  };

  const creditStatus = getCreditStatus();

  // Generate a consistent color from user's name
  const getAvatarColor = (name: string | undefined) => {
    if (!name) return "bg-purple-500";
    
    // Generate a hash from the name
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert to a color (using a nice palette)
    const colors = [
      "bg-pink-500",
      "bg-purple-500",
      "bg-blue-500",
      "bg-indigo-500",
      "bg-cyan-500",
      "bg-teal-500",
      "bg-emerald-500",
      "bg-amber-500",
      "bg-orange-500",
      "bg-rose-500",
    ];
    
    return colors[Math.abs(hash) % colors.length];
  };

  const avatarColor = getAvatarColor(user?.name);
  const userInitial = user?.name?.charAt(0).toUpperCase() || "U";

  return (
    <TooltipProvider>
      <Sidebar className={state === "collapsed" ? "w-20" : "w-60"} collapsible="icon">
        <SidebarContent className="bg-background border-r">
          {/* Brand */}
          <div className="p-3 border-b">
            {state !== "collapsed" ? (
              <div className="flex items-center justify-center gap-2">
                <img 
                  src={theme === 'light' ? LightModeLogo : DarkModeLogo} 
                  alt="Offerloop" 
                  className="h-[42px] w-auto object-contain" 
                />
              </div>
            ) : (
              <div className="flex items-center justify-center p-1">
                <img 
                  src={theme === 'light' ? SmushedSidebarLogoWhite : OfferloopIcon} 
                  alt="Offerloop" 
                  className="h-14 w-14 object-contain" 
                />
              </div>
            )}
          </div>

          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigationItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${getNavClass({
                            isActive,
                          })}`
                        }
                      >
                        <item.icon className="h-6 w-6" />
                        {state !== "collapsed" && (
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-lg">{item.title}</span>
                            {(item.title === "Coffee Chat Prep" || item.title === "Interview Prep") && (
                              <img src={theme === 'dark' ? CrownIconDark : CrownIcon} alt="Pro" className="h-4 w-4" />
                            )}
                          </div>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

                {/* Settings Dropdown */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <button
                      onClick={() => setSettingsExpanded(!settingsExpanded)}
                      className={`flex items-center justify-between w-full gap-3 px-3 py-2 rounded-md transition-colors ${getSettingsClass()}`}
                    >
                      <div className="flex items-center gap-3">
                        <Settings className="h-6 w-6" />
                        {state !== "collapsed" && <span className="text-lg">Settings</span>}
                      </div>
                      {state !== "collapsed" &&
                        (settingsExpanded ? (
                          <ChevronDown className="h-6 w-6" />
                        ) : (
                          <ChevronRight className="h-6 w-6" />
                        ))}
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Settings Submenu */}
                {settingsExpanded && state !== "collapsed" && (
                  <div className="ml-6 space-y-1">
                    {settingsItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.url}
                            end
                            className={({ isActive }) =>
                              `flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-lg ${getNavClass({
                                isActive,
                              })}`
                            }
                          >
                            <span className="text-lg">{item.title}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </div>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t bg-background">
          {/* Credits */}
          <div className="p-4">
            {state !== "collapsed" ? (
              <>
                {/* Credits Display */}
                <div className="text-lg font-bold mb-2 text-foreground">
                  {user?.credits ?? 0}/{user?.maxCredits ?? 120} credits
                </div>

                {/* Progress Bar - Pink purple gradient */}
                <div className="mb-4 w-full h-2 bg-[hsl(var(--border-light))] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300"
                    style={{ width: `${((user?.credits ?? 0) / (user?.maxCredits ?? 120)) * 100}%` }}
                  />
                </div>

                {/* Upgrade Button - KEEP GRADIENT (Primary CTA) */}
                <button
                  onClick={() => navigate("/pricing")}
                  className="w-full bg-gradient-to-r from-[hsl(var(--accent-from))] to-[hsl(var(--accent-to))] rounded-xl py-3 px-4 mb-4 text-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 active:scale-[0.98]"
                >
                  <div className="flex items-center justify-center gap-2">
                    <Zap className="w-5 h-5 text-white" />
                    <span className="font-semibold">Upgrade Plan</span>
                  </div>
                </button>
              </>
            ) : (
              // Collapsed view - KEEP GRADIENT (Primary CTA)
              <div className="mb-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => navigate("/pricing")}
                      className="w-full bg-gradient-to-r from-[hsl(var(--accent-from))] to-[hsl(var(--accent-to))] rounded-xl p-2 text-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 active:scale-[0.98] flex items-center justify-center relative"
                    >
                      <img src={LightningIcon} alt="Upgrade" className="h-10 w-10 object-contain brightness-0 invert" />
                      {user?.credits === 0 && (
                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <div className="text-xs">
                      <p className="font-medium">
                        Credits: {user?.credits ?? 0} / {user?.maxCredits ?? 0}
                      </p>
                      {creditStatus.message && <p className="mt-1">{creditStatus.message}</p>}
                      <p className="mt-1 text-muted-foreground">Click to upgrade</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}

            {/* User Profile */}
            <div className="flex items-center justify-center gap-3">
              <div className={`h-10 w-10 rounded-full ${avatarColor} flex items-center justify-center text-white font-semibold text-lg`}>
                {userInitial}
              </div>
              {state !== "collapsed" && (
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-medium truncate">{user?.name || "User"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.tier === "pro" ? "Pro Member" : "Free Tier"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  );
}