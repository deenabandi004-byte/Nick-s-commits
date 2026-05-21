import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { auth } from '@/lib/firebase';
import { BACKEND_URL } from '@/services/api';

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

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions?: {
    refined_query?: string;
    recommended_firms?: string[];
    firm_insights?: any;
    next_steps?: string[];
  };
  action_type?: string;
}

interface ScoutFirmAssistantProps {
  firmContext: FirmContext;
  userResume?: any;
  fitContext?: any;
  onApplyQuery?: (query: string) => void;
  onFindContacts?: (firmName: string) => void;
}

const ScoutFirmAssistant: React.FC<ScoutFirmAssistantProps> = ({
  firmContext,
  userResume,
  fitContext,
  onApplyQuery,
  onFindContacts,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`${BACKEND_URL}/api/scout/firm-assist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: text,
          firm_context: firmContext,
          fit_context: fitContext,
          conversation_history: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        suggestions: data.suggestions,
        action_type: data.action_type,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('[Scout] Firm assist error:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I ran into an issue. Please try again!",
      }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleApplyQuery = (query: string) => {
    if (onApplyQuery) {
      onApplyQuery(query);
    }
  };

  // Format message content with markdown-like styling
  const formatMessage = (content: string) => {
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br />');
  };

  // Quick actions based on current state
  const getQuickActions = () => {
    const hasResults = firmContext.current_results.length > 0;
    const hasQuery = firmContext.current_query.length > 0;
    
    if (!hasQuery && !hasResults) {
      // If user has resume, prioritize generating query from resume
      if (userResume) {
        return [
          { label: "Find firms based on my resume", action: "Help me find firms in accordance to my background" },
          { label: "Help me build a search", action: "Help me figure out what firms to search for" },
          { label: "Investment banking firms", action: "Search for investment banks in New York" },
          { label: "Consulting firms", action: "Search for consulting firms" },
        ];
      }
      return [
        { label: "Help me build a search", action: "Help me figure out what firms to search for" },
        { label: "Investment banking firms", action: "Search for investment banks in New York" },
        { label: "Consulting firms", action: "Search for consulting firms" },
      ];
    }
    
    if (hasResults) {
      return [
        { label: "Which fit my background?", action: "Which firms fit my background best?" },
        { label: "Show smaller firms", action: "Refine to show smaller or boutique firms" },
        { label: "What's next?", action: "What should I do next with these results?" },
        { label: `Tell me about ${firmContext.current_results[0]?.name || 'a firm'}`, action: `Tell me about ${firmContext.current_results[0]?.name || 'Goldman Sachs'}` },
      ];
    }
    
    return [
      { label: "Refine my search", action: "Help me refine my search" },
      { label: "Different location", action: "Show me firms in a different location" },
      { label: "Different industry", action: "Search for a different industry" },
    ];
  };

  const quickActions = getQuickActions();

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <>
            {/* Welcome message */}
            <div className="bg-[#FAFBFF] rounded-[3px] p-3">
              <p className="text-sm text-slate-700">
                {firmContext.current_results.length > 0 
                  ? `You have ${firmContext.current_results.length} firms. I can help you find the best fits or research any of them!`
                  : userResume
                    ? "I can analyze your resume and suggest the best firms to target, or help you build a search. What would you like to do?"
                    : "I can help you find the right firms to target. What industry or type of company are you interested in?"}
              </p>
            </div>

            {/* Quick actions */}
            <div className="flex flex-wrap gap-2">
              {quickActions.map((qa, idx) => (
                <button
                  key={idx}
                  onClick={() => sendMessage(qa.action)}
                  className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-colors text-left"
                >
                  {qa.label}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-[3px] p-3 ${
                message.role === 'user'
                  ? 'bg-[#0F172A] text-white'
                  : 'bg-slate-100 text-slate-800'
              }`}
            >
              {/* Message content */}
              <div 
                className="text-sm whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
              />

              {/* Action buttons for suggestions */}
              {message.suggestions && (
                <div className="mt-3 pt-2 border-t border-slate-200/50 space-y-2">
                  {message.suggestions.refined_query && (
                    <button
                      onClick={() => handleApplyQuery(message.suggestions!.refined_query!)}
                      className="w-full py-1.5 text-xs font-medium bg-[#0F172A] text-white rounded hover:bg-[#1E293B] transition-colors"
                    >
                      Use this search
                    </button>
                  )}
                  {message.suggestions.recommended_firms && message.suggestions.recommended_firms.length > 0 && (
                    <div className="space-y-1">
                      {message.suggestions.recommended_firms.slice(0, 3).map((firmName, idx) => (
                        <button
                          key={idx}
                          onClick={() => onFindContacts?.(firmName)}
                          className="w-full py-1.5 text-xs font-medium bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                        >
                          Find contacts at {firmName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-[3px] p-3">
              <div className="flex items-center gap-2 text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-200">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about firms..."
            className="flex-1 text-sm"
            disabled={isLoading}
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            size="sm"
            className="bg-[#0F172A] hover:bg-[#1E293B]"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ScoutFirmAssistant;
