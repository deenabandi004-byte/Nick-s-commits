import { Moon, Sun, Bell, Calendar } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface HeaderProps {
  title: string;
  onNavigateToOutbox?: () => void;
  onNavigateToCalendar?: () => void;
}

export default function Header({ title, onNavigateToOutbox, onNavigateToCalendar }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-16 bg-background flex items-center justify-between px-8">
      <div className="flex items-center gap-4">
        {title && <h1>{title}</h1>}
        </div>
        
        <div className="flex items-center gap-4">
        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="w-9 h-9 rounded-lg hover:bg-card border border-border flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        
        {/* Notifications */}
        <button 
          onClick={onNavigateToOutbox}
          className="w-9 h-9 rounded-lg hover:bg-card border border-border flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors relative"
        >
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-pink rounded-full"></span>
        </button>
              
        {/* Calendar */}
        <button 
          onClick={onNavigateToCalendar}
          className="w-9 h-9 rounded-lg hover:bg-card border border-border flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
        >
          <Calendar size={18} />
        </button>
        
        {/* User Avatar */}
        <div className="w-9 h-9 rounded-full bg-purple flex items-center justify-center text-white text-sm font-medium cursor-pointer">
          N
        </div>
      </div>
    </header>
  );
}
