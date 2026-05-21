import React, { useState, useEffect } from "react";
import ScoutChatbot from "./ScoutChatbot";
import { Button } from "@/components/ui/button";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface ScoutBubbleProps {
  onJobTitleSuggestion: (title: string, company?: string, location?: string) => void;
}

const ScoutBubble: React.FC<ScoutBubbleProps> = ({ onJobTitleSuggestion }) => {
  const { user } = useFirebaseAuth();
  const [isScoutChatOpen, setIsScoutChatOpen] = useState(false);
  const [userResume, setUserResume] = useState<any>(null);

  // Load user resume data from Firestore
  useEffect(() => {
    const loadUserResume = async () => {
      if (!user?.uid) return;
      
      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        
        if (snap.exists()) {
          const data = snap.data();
          // Build resume object from Firestore data
          const resumeData: any = {};
          
          // Include all parsed resume data if available (name, university, major, year, 
          // key_experiences, skills, achievements, interests)
          if (data.resumeParsed) {
            Object.assign(resumeData, data.resumeParsed);
          }
          
          // Include raw text if available (useful for detailed analysis)
          if (data.resumeText) {
            resumeData.rawText = data.resumeText;
          }
          
          setUserResume(resumeData);
        }
      } catch (error) {
        console.error('[ScoutBubble] Failed to load resume:', error);
      }
    };
    
    loadUserResume();
  }, [user?.uid]);

  // Add wave animation keyframes
  useEffect(() => {
    const waveKeyframes = `
      @keyframes wave {
        0%, 100% { transform: rotate(-8deg); }
        50% { transform: rotate(8deg); }
      }
    `;
    const style = document.createElement("style");
    style.textContent = waveKeyframes;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) document.head.removeChild(style);
    };
  }, []);

  return (
    <>
      {isScoutChatOpen && (
        <div className="fixed right-0 top-0 h-full w-80 bg-background shadow-2xl z-40 border-l border-border">
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-border bg-[#3B82F6]">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
                    style={{ backgroundColor: "#fff6e2" }}
                  >
                    <img src="/scout-mascot.png" alt="Scout AI" className="w-8 h-8 object-contain" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Scout AI</h3>
                    <p className="text-xs text-white/80">Job Title Assistant</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsScoutChatOpen(false)}
                  className="text-white/80 hover:text-white hover:bg-white/10"
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <ScoutChatbot 
                onJobTitleSuggestion={onJobTitleSuggestion} 
                userResume={userResume || undefined}
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Floating Scout Chat Bubble */}
      {!isScoutChatOpen && (
        <div 
          onClick={() => setIsScoutChatOpen(true)}
          className="fixed bottom-6 right-6 z-50 cursor-pointer group"
        >
          <div className="relative">
            {/* Main bubble */}
            <div className="relative bg-[#3B82F6] rounded-full p-1 shadow-2xl hover:shadow-[#3B82F6]/50 transition-all duration-300 hover:scale-110">
              <div className="bg-background rounded-full p-3">
                <div className="flex items-center gap-3 px-2">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
                    style={{ backgroundColor: "#fff6e2" }}
                  >
                    <img
                      src="/scout-mascot.png"
                      alt="Scout AI"
                      className="w-8 h-8 object-contain group-hover:scale-110 transition-transform duration-300"
                      style={{
                        animation: "wave 2.5s ease-in-out infinite",
                        transformOrigin: "center bottom",
                      }}
                    />
                  </div>
                  <div className="pr-2">
                    <p className="text-sm font-semibold text-foreground whitespace-nowrap">
                      Need help finding people?
                    </p>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      Ask Scout! →
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ScoutBubble;

