import { useState } from 'react';
import { motion } from 'framer-motion';
import { LayoutDashboard, Mail, Calendar as CalendarIcon } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import Header from '@/components/Header';
import { Dashboard } from '@/components/Dashboard';
import { Outbox } from '@/components/Outbox';
import { Calendar } from '@/components/Calendar';

type TabType = 'dashboard' | 'outbox' | 'calendar';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  const getTabPosition = () => {
    switch (activeTab) {
      case 'dashboard':
        return '4px';
      case 'outbox':
        return 'calc(33.33% + 2px)';
      case 'calendar':
        return 'calc(66.66% + 1px)';
      default:
        return '4px';
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="bg-background flex items-center border-b border-border">
            <div className="px-4 border-r border-border">
              <SidebarTrigger />
            </div>
            <div className="flex-1">
              <Header 
                title="" 
                onNavigateToOutbox={() => setActiveTab('outbox')}
                onNavigateToCalendar={() => setActiveTab('calendar')}
              />
            </div>
          </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-6xl mx-auto w-full p-4 lg:p-6">
          {/* Tabs */}
          <div className="flex justify-center mb-8">
            <div className="relative grid w-full grid-cols-3 max-w-lg bg-card border border-border p-1 rounded-xl h-14 overflow-hidden">
              {/* Animated sliding background */}
              <motion.div
                className="absolute bg-gradient-to-r from-pink-500 to-purple-500 rounded-lg h-12"
                initial={false}
                animate={{ 
                  left: getTabPosition(),
                  width: 'calc(33.33% - 4px)'
                }}
                transition={{ 
                  type: "spring", 
                  stiffness: 400, 
                  damping: 30 
                }}
                style={{ top: '4px' }}
              />
              
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`relative z-10 gap-2 h-12 font-medium transition-all flex items-center justify-center ${
                  activeTab === 'dashboard'
                    ? 'text-white'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <motion.div
                  whileHover={{ y: activeTab === 'dashboard' ? 0 : -1 }}
                  className="flex items-center gap-2"
                >
                  <LayoutDashboard className="h-5 w-5" />
                  Dashboard
                </motion.div>
              </button>
              
              <button
                onClick={() => setActiveTab('outbox')}
                className={`relative z-10 gap-2 h-12 font-medium transition-all flex items-center justify-center ${
                  activeTab === 'outbox'
                    ? 'text-white'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <motion.div
                  whileHover={{ y: activeTab === 'outbox' ? 0 : -1 }}
                  className="flex items-center gap-2"
                >
                  <Mail className="h-5 w-5" />
                  Outbox
                </motion.div>
              </button>
              
              <button
                onClick={() => setActiveTab('calendar')}
                className={`relative z-10 gap-2 h-12 font-medium transition-all flex items-center justify-center ${
                  activeTab === 'calendar'
                    ? 'text-white'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <motion.div
                  whileHover={{ y: activeTab === 'calendar' ? 0 : -1 }}
                  className="flex items-center gap-2"
                >
                  <CalendarIcon className="h-5 w-5" />
                  Calendar
                </motion.div>
              </button>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'outbox' && <Outbox />}
          {activeTab === 'calendar' && <Calendar />}
        </div>
      </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

