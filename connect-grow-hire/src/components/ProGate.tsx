import { type ReactNode } from "react";
import { LockKeyhole, Unlock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";

interface ProGateProps {
  title: string;
  description: string;
  videoId: string;
  children: ReactNode;
  bypass?: boolean;
}

export function ProGate({ title, description, videoId, children, bypass }: ProGateProps) {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();

  const isFree = !bypass && (!user?.tier || user.tier === "free");

  if (!isFree) {
    return <>{children}</>;
  }

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      <div
        className="flex-1 flex flex-col min-h-0 pointer-events-none select-none progate-blur"
        aria-hidden="true"
        style={{ filter: "blur(2px)" }}
      >
        {children}
      </div>

      <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto backdrop-blur-[2px]" style={{ backgroundColor: "rgba(255, 255, 255, 0.3)" }}>
        <div className="flex flex-col items-center space-y-3 px-4 sm:px-8 py-8">
          <LockKeyhole className="h-14 w-14 text-primary/60" />

          <h2 className="text-xl md:text-2xl font-bold text-foreground text-center">
            {title}
          </h2>

          <p className="text-sm text-muted-foreground text-center max-w-md">
            {description}
          </p>

          <div className="w-full max-w-sm rounded-[3px] overflow-hidden" style={{ aspectRatio: "16/9" }}>
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?rel=0`}
              className="w-full h-full"
              allow="encrypted-media"
              allowFullScreen
              title={`${title} demo`}
            />
          </div>

          <button
            type="button"
            onClick={() => navigate("/pricing")}
            className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full font-bold text-base text-white transition-all duration-150 hover:shadow-md hover:scale-[1.02] mt-[30px]"
            style={{
              background: "#0F172A",
            }}
          >
            <Unlock className="h-4 w-4" />
            Start Free Trial
          </button>

          <div className="mt-3 flex flex-col items-center space-y-1">
            <span className="text-sm font-medium text-foreground">14-day free trial</span>
            <span className="text-xs text-muted-foreground">Then $14.99/mo · Cancel anytime</span>
          </div>
        </div>
      </div>
    </div>
  );
}
