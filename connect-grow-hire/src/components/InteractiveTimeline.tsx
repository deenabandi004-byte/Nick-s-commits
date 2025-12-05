import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TimelinePhase } from '@/types/timeline';
import { Edit2, X, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface InteractiveTimelineProps {
  phases: TimelinePhase[];
  startDate: string;
  targetDeadline: string;
  onUpdate?: (phases: TimelinePhase[]) => void;
}

export function InteractiveTimeline({ phases, startDate, targetDeadline, onUpdate }: InteractiveTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editingPhase, setEditingPhase] = useState<number | null>(null);
  const [editedPhases, setEditedPhases] = useState<TimelinePhase[]>(phases);
  const [draggedPhase, setDraggedPhase] = useState<number | null>(null);
  const [dragTargetMonth, setDragTargetMonth] = useState<number | null>(null);

  // Update edited phases when phases prop changes
  useEffect(() => {
    setEditedPhases(phases);
  }, [phases]);

  // Helper functions for date manipulation
  const parseDate = (dateStr: string): Date => {
    return new Date(dateStr + 'T00:00:00');
  };

  const startOfMonth = (date: Date): Date => {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  };

  const addMonths = (date: Date, months: number): Date => {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  };

  const differenceInMonths = (dateLeft: Date, dateRight: Date): number => {
    const yearDiff = dateLeft.getFullYear() - dateRight.getFullYear();
    const monthDiff = dateLeft.getMonth() - dateRight.getMonth();
    return yearDiff * 12 + monthDiff;
  };

  const isSameMonth = (dateLeft: Date, dateRight: Date): boolean => {
    return dateLeft.getFullYear() === dateRight.getFullYear() &&
           dateLeft.getMonth() === dateRight.getMonth();
  };

  const formatMonth = (date: Date): string => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[date.getMonth()];
  };

  const formatMonthFull = (date: Date): string => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  // Calculate all months between start and end
  const start = startOfMonth(parseDate(startDate));
  const end = startOfMonth(parseDate(targetDeadline));
  const totalMonths = differenceInMonths(end, start) + 1;
  
  const months: Date[] = [];
  for (let i = 0; i < totalMonths; i++) {
    months.push(addMonths(start, i));
  }

  // Find current month position
  const currentMonthIndex = months.findIndex(month => 
    isSameMonth(month, currentMonth)
  );

  // Parse phase months and map to actual dates
  const parsePhaseMonth = (monthStr: string, baseDate: Date): Date => {
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIndex = monthNames.findIndex(m => monthStr.toLowerCase().startsWith(m));
    if (monthIndex !== -1) {
      const yearMatch = monthStr.match(/\d{4}/);
      const year = yearMatch ? parseInt(yearMatch[0]) : baseDate.getFullYear();
      return new Date(year, monthIndex, 1);
    }
    return baseDate;
  };

  // Calculate phase positions
  const phasePositions = editedPhases.map(phase => {
    const phaseStart = parsePhaseMonth(phase.startMonth, start);
    const phaseEnd = parsePhaseMonth(phase.endMonth, start);
    
    const startIndex = months.findIndex(m => isSameMonth(m, phaseStart));
    const endIndex = months.findIndex(m => isSameMonth(m, phaseEnd));
    
    return {
      phase,
      startIndex: startIndex >= 0 ? startIndex : 0,
      endIndex: endIndex >= 0 ? endIndex : totalMonths - 1,
      phaseStart,
      phaseEnd,
    };
  });

  // Handle phase drag to move
  const handlePhaseDragStart = (phaseIndex: number) => {
    setDraggedPhase(phaseIndex);
  };

  const handleMonthHover = (monthIndex: number) => {
    if (draggedPhase !== null) {
      setDragTargetMonth(monthIndex);
    }
  };

  const handlePhaseDrop = (targetMonthIndex: number) => {
    if (draggedPhase === null) return;
    
    const targetMonth = months[targetMonthIndex];
    const newPhases = [...editedPhases];
    const phase = newPhases[draggedPhase];
    
    // Update phase start month
    const newStartMonth = formatMonthFull(targetMonth);
    const duration = differenceInMonths(parsePhaseMonth(phase.endMonth, start), parsePhaseMonth(phase.startMonth, start));
    const newEndDate = addMonths(targetMonth, duration);
    const newEndMonth = formatMonthFull(newEndDate);
    
    newPhases[draggedPhase] = {
      ...phase,
      startMonth: newStartMonth,
      endMonth: newEndMonth,
    };
    
    setEditedPhases(newPhases);
    setDraggedPhase(null);
    setDragTargetMonth(null);
    if (onUpdate) onUpdate(newPhases);
  };

  // Handle phase edit
  const handlePhaseEdit = (phaseIndex: number) => {
    setEditingPhase(phaseIndex);
  };

  const handlePhaseSave = (phaseIndex: number, updatedPhase: TimelinePhase) => {
    const newPhases = [...editedPhases];
    newPhases[phaseIndex] = updatedPhase;
    setEditedPhases(newPhases);
    setEditingPhase(null);
    if (onUpdate) onUpdate(newPhases);
  };

  const handlePhaseCancel = () => {
    setEditingPhase(null);
  };

  // Scroll to current month on mount
  useEffect(() => {
    if (timelineRef.current && currentMonthIndex >= 0) {
      const monthWidth = 200;
      const scrollPosition = (currentMonthIndex * monthWidth) - (timelineRef.current.clientWidth / 2);
      timelineRef.current.scrollTo({ left: Math.max(0, scrollPosition), behavior: 'smooth' });
    }
  }, [currentMonthIndex]);

  // Calculate "You Are Here" position
  const youAreHerePosition = currentMonthIndex >= 0 
    ? ((currentMonthIndex / (totalMonths - 1 || 1)) * 100) 
    : 0;

  return (
    <div className="w-full max-w-full bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div 
          ref={timelineRef}
          className="overflow-x-auto pb-4 w-full"
          style={{ 
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(139, 92, 246, 0.3) transparent'
          }}
        >
          <div className="relative" style={{ minWidth: `${Math.max(totalMonths * 180, 600)}px`, height: '220px', paddingLeft: '75px', paddingRight: '75px' }}>
            {/* Timeline Line - More vibrant and visible */}
            <div className="absolute top-[70px] left-[75px] right-[75px] h-[3px] z-0">
              <div 
                className="w-full h-full rounded-full" 
                style={{ background: 'linear-gradient(to right, #8B5CF6, #D946EF)' }}
              />
            </div>

            {/* Month Labels and Phase Cards */}
            <div className="relative flex justify-between items-start h-full">
              {months.map((month, index) => {
                const isCurrent = index === currentMonthIndex;
                const isPast = index < currentMonthIndex;
                const position = (index / (totalMonths - 1 || 1)) * 100;
                
                // Find phase that starts at this month
                const phaseAtMonth = phasePositions.find(p => p.startIndex === index);
                
                return (
                  <div
                    key={index}
                    className="flex flex-col items-center absolute"
                    style={{ 
                      left: `${position}%`, 
                      transform: 'translateX(-50%)',
                      width: '150px'
                    }}
                    onMouseEnter={() => handleMonthHover(index)}
                    onMouseUp={() => {
                      if (draggedPhase !== null) {
                        handlePhaseDrop(index);
                      }
                    }}
                  >
                    {/* Month Label - Black, not faded */}
                    <div className={`font-medium mb-3 ${
                      isCurrent ? 'text-black dark:text-white font-semibold' :
                      isPast ? 'text-black dark:text-gray-300' :
                      'text-black dark:text-gray-400'
                    }`}>
                      {formatMonth(month)}
                    </div>

                    {/* Phase Indicator Dot - Black, not faded */}
                    <div className="relative z-10 mb-3">
                      {phaseAtMonth ? (
                        (() => {
                          const isActive = phaseAtMonth.startIndex <= currentMonthIndex && phaseAtMonth.endIndex >= currentMonthIndex;
                          return isActive ? (
                            <motion.div
                              className="w-[10px] h-[10px] rounded-full gradient-bg"
                              style={{ boxShadow: '0 0 12px rgba(139, 92, 246, 0.6), 0 0 24px rgba(217, 70, 239, 0.4)' }}
                              animate={{ scale: [0.8, 1.1, 0.8] }}
                              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                            />
                          ) : (
                            <div className="w-[10px] h-[10px] rounded-full bg-black dark:bg-white border-2 border-black dark:border-white" />
                          );
                        })()
                      ) : (
                        <div className="w-[10px] h-[10px] rounded-full bg-black dark:bg-white border-2 border-black dark:border-white" />
                      )}
                    </div>

                    {/* Connection Line */}
                    <div className="w-[1px] h-10 bg-border/50 mb-2" />

                    {/* Phase Card - More colorful and engaging */}
                    {phaseAtMonth && (
                      <motion.div
                        className={`mt-2 px-4 py-3 rounded-xl border-2 text-center text-sm transition-all relative group ${
                          (() => {
                            const isActive = phaseAtMonth.startIndex <= currentMonthIndex && phaseAtMonth.endIndex >= currentMonthIndex;
                            if (isActive) {
                              return 'bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-purple-600/20 border-purple-400 shadow-lg shadow-purple-500/20';
                            } else {
                              return 'bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border-slate-300 dark:border-slate-600 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md';
                            }
                          })()
                        }`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ y: -4, scale: 1.02, transition: { duration: 0.2 } }}
                        draggable
                        onDragStart={() => handlePhaseDragStart(phasePositions.indexOf(phaseAtMonth))}
                        style={{ cursor: 'grab' }}
                        onDragEnd={() => {
                          setDraggedPhase(null);
                          setDragTargetMonth(null);
                        }}
                      >
                        {/* Edit button */}
                        <button
                          onClick={() => handlePhaseEdit(phasePositions.indexOf(phaseAtMonth))}
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/20"
                        >
                          <Edit2 className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                        </button>

                        {editingPhase === phasePositions.indexOf(phaseAtMonth) ? (
                          <PhaseEditForm
                            phase={phaseAtMonth.phase}
                            onSave={(updated) => handlePhaseSave(phasePositions.indexOf(phaseAtMonth), updated)}
                            onCancel={handlePhaseCancel}
                          />
                        ) : (
                          <>
                            <div className={`font-semibold mb-1 ${
                              (() => {
                                const isActive = phaseAtMonth.startIndex <= currentMonthIndex && phaseAtMonth.endIndex >= currentMonthIndex;
                                return isActive 
                                  ? 'text-purple-700 dark:text-purple-300' 
                                  : 'text-slate-700 dark:text-slate-300';
                              })()
                            }`}>
                              {phaseAtMonth.phase.name}
                            </div>
                            <div className={`text-xs leading-relaxed ${
                              (() => {
                                const isActive = phaseAtMonth.startIndex <= currentMonthIndex && phaseAtMonth.endIndex >= currentMonthIndex;
                                return isActive 
                                  ? 'text-purple-600 dark:text-purple-400' 
                                  : 'text-slate-600 dark:text-slate-400';
                              })()
                            }`}>
                              {phaseAtMonth.phase.description}
                            </div>
                            {phaseAtMonth.phase.goals && phaseAtMonth.phase.goals.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-purple-200/50 dark:border-purple-700/50">
                                <div className="text-xs space-y-1 text-left">
                                  {phaseAtMonth.phase.goals.slice(0, 2).map((goal, idx) => (
                                    <div key={idx} className="flex items-start gap-1.5">
                                      <span className="text-purple-500 dark:text-purple-400 mt-0.5">•</span>
                                      <span className={(() => {
                                        const isActive = phaseAtMonth.startIndex <= currentMonthIndex && phaseAtMonth.endIndex >= currentMonthIndex;
                                        return isActive 
                                          ? 'text-purple-600 dark:text-purple-400' 
                                          : 'text-slate-500 dark:text-slate-400';
                                      })()}>
                                        {goal}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* "You Are Here" indicator */}
            {currentMonthIndex >= 0 && (
              <motion.div
                className="absolute top-0 z-20"
                style={{ 
                  left: `calc(${youAreHerePosition}% + 75px)`,
                  transform: 'translateX(-50%)'
                }}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
              >
                <div className="flex flex-col items-center">
                  <motion.div 
                    className="mb-2 px-3 py-1.5 rounded-full gradient-bg text-white text-xs font-medium shadow-lg"
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    You Are Here
                  </motion.div>

                  <div 
                    className="w-[3px] h-[66px] rounded-full"
                    style={{ background: 'linear-gradient(to bottom, #8B5CF6, #D946EF)' }}
                  />

                  <motion.div
                    className="relative"
                    animate={{ 
                      boxShadow: [
                        '0 0 0 0 rgba(139, 92, 246, 0.6)',
                        '0 0 0 10px rgba(139, 92, 246, 0)',
                        '0 0 0 0 rgba(139, 92, 246, 0)'
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <div 
                      className="w-4 h-4 rounded-full gradient-bg"
                      style={{ boxShadow: '0 2px 8px rgba(139, 92, 246, 0.4)' }}
                    />
                  </motion.div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Phase Edit Form Component
function PhaseEditForm({ phase, onSave, onCancel }: { phase: TimelinePhase; onSave: (phase: TimelinePhase) => void; onCancel: () => void }) {
  const [name, setName] = useState(phase.name);
  const [description, setDescription] = useState(phase.description);
  const [goals, setGoals] = useState(phase.goals.join('\n'));

  const handleSave = () => {
    onSave({
      ...phase,
      name,
      description,
      goals: goals.split('\n').filter(g => g.trim()),
    });
  };

  return (
    <div className="space-y-2 text-left">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Phase name"
        className="text-sm"
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        rows={2}
        className="text-xs resize-none"
      />
      <Textarea
        value={goals}
        onChange={(e) => setGoals(e.target.value)}
        placeholder="Goals (one per line)"
        rows={2}
        className="text-xs resize-none"
      />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-3 w-3" />
        </Button>
        <Button size="sm" onClick={handleSave}>
          <Check className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
