import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAutocomplete } from '@/hooks/useAutocomplete';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  dataType: 'job_title' | 'company' | 'location' | 'school';
  disabled?: boolean;
  className?: string;
}

export const AutocompleteInput = ({
  value,
  onChange,
  placeholder,
  dataType,
  disabled = false,
  className
}: AutocompleteInputProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const { suggestions, isLoading, error } = useAutocomplete(dataType, inputValue, isOpen);

  // Sync with external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    
    // Open dropdown when user types 2+ characters
    if (newValue.length >= 2 && !disabled) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setInputValue(suggestion);
    onChange(suggestion);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleInputFocus = () => {
    if (inputValue.length >= 2 && !disabled) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = () => {
    // Delay closing to allow for suggestion clicks
    setTimeout(() => setIsOpen(false), 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const showDropdown = isOpen && !disabled && inputValue.length >= 2;
  const hasContent = isLoading || suggestions.length > 0 || !!error;

  return (
    <div className="relative">
      <Popover open={!!(showDropdown && hasContent)}>
        <PopoverTrigger asChild>
          <div>
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              className={cn(className, showDropdown && "rounded-b-none")}
            />
          </div>
        </PopoverTrigger>
        
        <PopoverContent 
          className="w-full p-0 mt-0 rounded-t-none border-t-0" 
          align="start"
          side="bottom"
          sideOffset={-1}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandList className="max-h-48">
              {isLoading && (
                <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading suggestions...
                </div>
              )}
              
              {error && (
                <div className="p-4 text-sm text-destructive">
                  Error loading suggestions: {error}
                </div>
              )}
              
              {!isLoading && !error && suggestions.length === 0 && inputValue.length >= 2 && (
                <div className="p-4 text-sm text-muted-foreground">
                  No suggestions found for "{inputValue}"
                </div>
              )}
              
              {!isLoading && !error && suggestions.length > 0 && (
                <CommandGroup>
                  {suggestions.slice(0, 8).map((suggestion, index) => (
                    <CommandItem
                      key={`${suggestion}-${index}`}
                      value={suggestion}
                      onSelect={() => handleSuggestionSelect(suggestion)}
                      className="cursor-pointer hover:bg-accent"
                    >
                      <span className="truncate">{suggestion}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};