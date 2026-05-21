import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { MainContentWrapper } from '@/components/MainContentWrapper';
import { AppHeader } from '@/components/AppHeader';
import { Calendar } from '@/components/Calendar';

export default function CalendarPage() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <MainContentWrapper>
          <AppHeader title="" />
          
          <main className="px-3 py-6 sm:px-6 sm:py-12" style={{ background: '#FAFBFF', flex: 1, overflowY: 'auto' }}>
            <div style={{ width: '100%', minWidth: 'fit-content' }}>
              <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
                {/* Page Title */}
                <h1
                  className="text-[28px] sm:text-[42px]"
                  style={{
                    fontFamily: "'Lora', Georgia, serif",
                    fontWeight: 400,
                    letterSpacing: '-0.025em',
                    color: '#0F172A',
                    textAlign: 'center',
                    marginBottom: '10px',
                    lineHeight: 1.1,
                  }}
                >
                  Calendar
                </h1>
                
                {/* Helper text */}
                <p
                  style={{
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    fontSize: '16px',
                    color: '#6B7280',
                    textAlign: 'center',
                    marginBottom: '28px',
                    lineHeight: 1.5,
                  }}
                >
                  View and manage your scheduled events, meetings, and follow-up reminders.
                </p>
                
                {/* Calendar Component */}
                <div className="bg-white rounded-[3px] border border-[#E2E8F0] overflow-hidden">
                  <Calendar />
                </div>
              </div>
            </div>
          </main>
        </MainContentWrapper>
      </div>
    </SidebarProvider>
  );
}
