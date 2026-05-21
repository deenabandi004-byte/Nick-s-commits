import React, { useState, useEffect, useRef } from "react";
import ScoutFirmAssistant from "./ScoutFirmAssistant";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface Firm {
  name: string;
  industry?: string;
  location?: any;
  size?: string;
  description?: string;
}

interface FirmContext {
  current_query: string;
  current_results: Firm[];
  parsed_filters?: any;
}

interface ScoutFirmAssistantButtonProps {
  firmContext: FirmContext;
  fitContext?: any;
  onApplyQuery?: (query: string) => void;
  onFindContacts?: (firmName: string) => void;
}

const ScoutFirmAssistantButton: React.FC<ScoutFirmAssistantButtonProps> = ({
  firmContext,
  fitContext,
  onApplyQuery,
  onFindContacts,
}) => {
  const { user } = useFirebaseAuth();
  const [isScoutChatOpen, setIsScoutChatOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 370, height: 600 });
  const [userResume, setUserResume] = useState<any>(null);
  
  // Initialize position when window opens (only once)
  useEffect(() => {
    if (isScoutChatOpen && !hasInitializedPosition.current) {
      setPosition({
        x: Math.max(16, window.innerWidth - size.width - 16),
        y: 16,
      });
      hasInitializedPosition.current = true;
    } else if (!isScoutChatOpen) {
      hasInitializedPosition.current = false;
    }
  }, [isScoutChatOpen, size.width]);

  // Keep window in bounds on browser resize
  useEffect(() => {
    const handleWindowResize = () => {
      if (isScoutChatOpen) {
        const maxX = window.innerWidth - size.width;
        const maxY = window.innerHeight - size.height;
        setPosition(prev => ({
          x: Math.max(0, Math.min(prev.x, maxX)),
          y: Math.max(0, Math.min(prev.y, maxY)),
        }));
      }
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [isScoutChatOpen, size]);
  
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const hasInitializedPosition = useRef(false);

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
        console.error('[ScoutFirmAssistantButton] Failed to load resume:', error);
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
      @keyframes ping-soft {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.25); opacity: 0.4; }
        100% { transform: scale(1); opacity: 1; }
      }
    `;
    const style = document.createElement("style");
    style.textContent = waveKeyframes;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) document.head.removeChild(style);
    };
  }, []);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (chatWindowRef.current) {
      setIsDragging(true);
      const rect = chatWindowRef.current.getBoundingClientRect();
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      e.preventDefault();
    }
  };

  // Resize handlers
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (chatWindowRef.current) {
      setIsResizing(true);
      const rect = chatWindowRef.current.getBoundingClientRect();
      setResizeStart({
        x: e.clientX,
        y: e.clientY,
        width: rect.width,
        height: rect.height,
        posX: position.x,
        posY: position.y,
      });
    }
  };

  // Global mouse move handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;
        
        // Constrain to viewport
        const maxX = window.innerWidth - size.width;
        const maxY = window.innerHeight - size.height;
        
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY)),
        });
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        
        const minWidth = 300;
        const minHeight = 400;
        
        // For top-left resize: dragging left/up increases size and moves position
        const newWidth = resizeStart.width - deltaX;
        const newHeight = resizeStart.height - deltaY;
        const newX = resizeStart.posX + deltaX;
        const newY = resizeStart.posY + deltaY;
        
        // Calculate constraints
        const maxWidth = window.innerWidth - newX;
        const maxHeight = window.innerHeight - newY;
        
        // Clamp width and height
        const clampedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
        const clampedHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
        
        // Adjust position based on clamped size
        const finalX = resizeStart.posX + (resizeStart.width - clampedWidth);
        const finalY = resizeStart.posY + (resizeStart.height - clampedHeight);
        
        setSize({
          width: clampedWidth,
          height: clampedHeight,
        });
        
        setPosition({
          x: Math.max(0, finalX),
          y: Math.max(0, finalY),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, resizeStart, size, position]);

  return (
    <>
      {isScoutChatOpen && (
        <div
          ref={chatWindowRef}
          className="fixed z-40 flex flex-col rounded-[3px] border border-[#E2E8F0] bg-white shadow-lg overflow-hidden"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: `${size.width}px`,
            height: `${size.height}px`,
            cursor: isDragging ? 'grabbing' : 'default',
            userSelect: isDragging || isResizing ? 'none' : 'auto',
          }}
        >
          {/* Minimal Header - Draggable */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0] bg-white cursor-grab active:cursor-grabbing select-none"
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center space-x-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: "#fff6e2" }}
              >
                <img src="/scout-mascot.png" alt="Scout AI" className="w-6 h-6 object-contain" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Scout AI</h3>
              </div>
            </div>
            <button
              onClick={() => setIsScoutChatOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              Close
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScoutFirmAssistant 
              firmContext={firmContext}
              userResume={userResume || undefined}
              fitContext={fitContext}
              onApplyQuery={onApplyQuery}
              onFindContacts={onFindContacts}
            />
          </div>
          {/* Resize Handle - Top Left */}
          <div
            className="absolute top-0 left-0 w-6 h-6 cursor-nwse-resize z-10"
            onMouseDown={handleResizeMouseDown}
            style={{
              background: 'linear-gradient(to bottom right, transparent 0%, transparent 40%, #E2E8F0 40%, #E2E8F0 45%, transparent 45%, transparent 100%)',
            }}
          >
            <div className="absolute top-1 left-1 w-3 h-3 border-l-2 border-t-2 border-slate-400"></div>
          </div>
        </div>
      )}
      
      {/* Header Button */}
      <button
        onClick={() => setIsScoutChatOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 bg-[#FAFBFF] border-[#E2E8F0] text-sm font-medium text-[#0F172A] shadow-sm hover:shadow-md hover:scale-105 hover:bg-white cursor-pointer transition-all duration-150"
      >
        <div className="relative flex items-center justify-center h-6 w-6 rounded-full bg-[#FFF7EA] flex-shrink-0">
          <img
            src="/scout-mascot.png"
            alt="Scout AI"
            className="w-4 h-4 object-contain"
            style={{
              animation: "wave 2.5s ease-in-out infinite",
              transformOrigin: "center bottom",
            }}
          />
          {/* Small pulsing notification dot */}
          <span
            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#3B82F6]"
            style={{
              animation: "ping-soft 1.2s ease-in-out infinite",
            }}
          />
        </div>
        <span className="whitespace-nowrap hidden sm:inline">Ask Scout</span>
      </button>
    </>
  );
};

export default ScoutFirmAssistantButton;
