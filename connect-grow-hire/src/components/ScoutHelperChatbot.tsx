/**
 * ScoutHelperChatbot - Lightweight chatbot for navigation, explanation, and routing.
 * NO deep analysis, NO scores, requirements, resume edits, or cover letters.
 * Can link users to Application Lab.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, ExternalLink, Bot, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/lib/firebase';
import { useFirebaseAuth } from '@/contexts/FirebaseAuthContext';
import { 
  ScoutConversation, 
  createConversation,
  getConversation,
  addMessagePair
} from '@/services/scoutConversations';
import { ScoutConversationList } from './ScoutConversationList';
import { BACKEND_URL } from '@/services/api';

interface SearchFields {
  job_title?: string;
  company?: string;
  location?: string;
  experience_level?: string;
}

interface JobListing {
  title: string;
  company: string;
  location?: string;
  url?: string;
  snippet?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fields?: SearchFields;
  jobListings?: JobListing[];
  timestamp: Date;
}

interface UserResume {
  skills?: string[];
  experience?: Array<{
    title: string;
    company: string;
    duration?: string;
    description?: string;
  }>;
  education?: Array<{
    school: string;
    degree: string;
    field?: string;
    year?: string;
  }>;
  summary?: string;
  rawText?: string;
  name?: string;
  university?: string;
  major?: string;
  year?: string;
  location?: string;
  key_experiences?: string[];
  achievements?: string[];
  interests?: string[];
  resumeParsed?: {
    name?: string;
    university?: string;
    major?: string;
    year?: string;
    location?: string;
    key_experiences?: string[];
    skills?: string[];
    achievements?: string[];
    interests?: string[];
  };
}

interface ScoutHelperChatbotProps {
  onJobTitleSuggestion?: (title: string, company?: string, location?: string) => void;
  userResume?: UserResume;
  showSidebar?: boolean;
}

/**
 * Simplifies complex job titles for better contact search results.
 */
const simplifyJobTitle = (title: string): string => {
  if (!title) return title;
  
  const coreRoles = [
    'Software Engineer', 'Software Developer', 'Engineer',
    'Product Manager', 'Program Manager', 'Project Manager',
    'Data Scientist', 'Data Analyst', 'Data Engineer',
    'Investment Banking Analyst', 'Investment Banker',
    'Financial Analyst', 'Business Analyst', 'Analyst',
    'Consultant', 'Associate', 'Manager', 'Director',
    'Designer', 'Researcher', 'Scientist',
    'Account Executive', 'Sales Representative',
    'Marketing Manager', 'Marketing Specialist',
    'Operations Manager', 'Operations Analyst',
    'HR Manager', 'Recruiter', 'Talent Acquisition',
    'Attorney', 'Lawyer', 'Counsel',
    'Accountant', 'Controller', 'Auditor',
  ];
  
  const seniorityLevels = ['Senior', 'Staff', 'Principal', 'Lead', 'Junior', 'Associate', 'Vice President', 'VP'];
  
  const titleLower = title.toLowerCase();
  
  let matchedRole = '';
  for (const role of coreRoles) {
    if (titleLower.includes(role.toLowerCase())) {
      matchedRole = role;
      break;
    }
  }
  
  if (!matchedRole) {
    if (title.length > 40) {
      const parts = title.split(/[-– - ,&]/);
      const lastPart = parts[parts.length - 1].trim();
      if (lastPart.length > 3) {
        return lastPart;
      }
    }
    return title;
  }
  
  let seniority = '';
  for (const level of seniorityLevels) {
    if (titleLower.includes(level.toLowerCase())) {
      seniority = level;
      break;
    }
  }
  
  if (seniority && !matchedRole.toLowerCase().includes(seniority.toLowerCase())) {
    return `${seniority} ${matchedRole}`;
  }
  
  return matchedRole;
};

const ScoutHelperChatbot: React.FC<ScoutHelperChatbotProps> = ({ 
  onJobTitleSuggestion, 
  userResume,
  showSidebar = true 
}) => {
  const { user } = useFirebaseAuth();
  const navigate = useNavigate();
  
  const [currentConversation, setCurrentConversation] = useState<ScoutConversation | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(showSidebar);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<Record<string, any>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectConversation = async (conversation: ScoutConversation) => {
    setCurrentConversation(conversation);
    
    const chatMessages: ChatMessage[] = (conversation.messages || []).map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      fields: msg.metadata?.fields,
      jobListings: msg.metadata?.jobListings,
      timestamp: msg.timestamp?.toDate ? msg.timestamp.toDate() : new Date(msg.timestamp as any)
    }));
    
    setMessages(chatMessages);
  };

  const handleNewConversation = () => {
    setCurrentConversation(null);
    setMessages([]);
    setContext({});
    setRefreshTrigger(prev => prev + 1);
    inputRef.current?.focus();
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !user?.uid) return;

    const userMessageText = input.trim();
    setInput('');
    setIsLoading(true);

    const tempUserMsg: ChatMessage = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content: userMessageText,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      let conversationId = currentConversation?.id;
      if (!conversationId) {
        conversationId = await createConversation(user.uid, userMessageText);
      }

      const historyForApi = messages.slice(-15).map(m => ({
        role: m.role,
        content: m.content
      }));

      const firebaseUser = auth.currentUser;
      const token = firebaseUser ? await firebaseUser.getIdToken() : null;
      
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${BACKEND_URL}/api/scout/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: userMessageText,
          conversation_id: conversationId,
          conversation_history: historyForApi,
          context,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Scout] API error:', response.status, errorText);
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (data.context) {
        setContext(data.context);
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message || 'I received your message but had trouble processing it. Please try again.',
        fields: data.fields,
        jobListings: data.job_listings,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev.slice(0, -1), tempUserMsg, assistantMessage]);

      try {
        await addMessagePair(
          user.uid,
          conversationId,
          userMessageText,
          assistantMessage.content,
          {
            intent: data.intent,
            fields: data.fields,
            jobListings: data.job_listings,
          }
        );
      } catch (firestoreError) {
        console.error('[Scout] Failed to save to Firestore:', firestoreError);
      }

      try {
        if (!currentConversation) {
          const newConvo = await getConversation(user.uid, conversationId);
          if (newConvo) {
            setCurrentConversation(newConvo);
            setRefreshTrigger(prev => prev + 1);
          }
        } else {
          setRefreshTrigger(prev => prev + 1);
        }
      } catch (conversationError) {
        console.error('[Scout] Failed to update conversation:', conversationError);
      }

      if (data.fields) {
        const { job_title, company, location } = data.fields;
        if ((job_title || company || location) && onJobTitleSuggestion) {
          try {
            onJobTitleSuggestion(
              job_title || '',
              company || undefined,
              location || undefined
            );
          } catch (suggestionError) {
            console.error('[Scout] Failed to populate fields:', suggestionError);
          }
        }
      }

    } catch (error) {
      console.error('[Scout] Error:', error);
      const errorMessage = error instanceof Error 
        ? `I ran into an issue: ${error.message}. Please try again.`
        : "Oops! I ran into an issue. Please try again or rephrase your message.";
      
      setMessages(prev => [...prev.slice(0, -1), tempUserMsg, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: errorMessage,
        timestamp: new Date(),
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

  const handleJobClick = (job: JobListing) => {
    if (onJobTitleSuggestion) {
      const simplifiedTitle = simplifyJobTitle(job.title);
      onJobTitleSuggestion(simplifiedTitle, job.company, job.location || undefined);
    }
  };

  const formatMessage = (content: string | undefined) => {
    if (!content) return '';
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br />');
  };

  return (
    <div className="flex h-full bg-white rounded-[3px] shadow-lg overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-64 flex-shrink-0">
          <ScoutConversationList
            currentConversationId={currentConversation?.id || null}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            refreshTrigger={refreshTrigger}
          />
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-200">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Bot className="text-[#3B82F6]" size={20} />
            <span className="font-semibold text-gray-900">Scout</span>
          </div>
          {currentConversation && (
            <span className="text-sm text-gray-500 truncate">
              {currentConversation.title}
            </span>
          )}
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Static Scout Message Bubble */}
          {messages.length === 0 && (
            <div className="mt-6 mx-6 p-4 rounded-[3px] bg-[#FAFBFF]">
              <p className="text-base text-slate-800">
                Hey! I'm Scout. I can help you navigate Offerloop, explain features, and guide you to the right tools.
                {' '}
                <button
                  onClick={() => navigate('/application-lab')}
                  className="text-[#3B82F6] underline font-medium"
                >
                  Try Application Lab
                </button>
                {' '}for detailed job analysis and application strengthening.
              </p>
            </div>
          )}

          {/* Chat Messages */}
          <div className="px-6 py-6 space-y-5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-[3px] p-4 ${
                    message.role === 'user'
                      ? 'text-white'
                      : 'bg-[#FAFBFF] text-slate-800'
                  }`}
                  style={message.role === 'user' ? { background: 'linear-gradient(135deg, #0F172A, #1E293B)' } : undefined}
                >
                  {message.content && (
                    <div
                      className="text-base leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                    />
                  )}

                  {message.fields && Object.keys(message.fields).length > 0 && (
                    <div className="mt-4 p-3 bg-[#FAFBFF] border border-[#E2E8F0] rounded-[3px]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-[#0F172A] text-sm font-medium">
                          <Bot className="h-4 w-4" />
                          Search fields updated!
                        </div>
                      </div>
                      <div className="text-sm text-[#3B82F6] space-y-1">
                        {message.fields.job_title && (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Title:</span>
                            <span>{message.fields.job_title}</span>
                          </div>
                        )}
                        {message.fields.company && (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Company:</span>
                            <span>{message.fields.company}</span>
                          </div>
                        )}
                        {message.fields.location && (
                          <div className="flex items-center gap-1">
                            <span className="font-medium">Location:</span>
                            <span>{message.fields.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {message.jobListings && message.jobListings.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <div className="text-sm text-slate-600 font-medium">Click to use for search:</div>
                      {message.jobListings.slice(0, 5).map((job, idx) => (
                        <div
                          key={idx}
                          className="bg-white rounded-lg border border-slate-200 p-4 cursor-pointer hover:border-[#3B82F6] transition-colors"
                          onClick={() => handleJobClick(job)}
                        >
                          <div className="text-base font-medium text-slate-900">{job.title}</div>
                          <div className="text-sm text-slate-500">
                            {job.company}
                            {job.location && ` • ${job.location}`}
                          </div>
                          {job.url && job.url.trim() && job.url.startsWith('http') && (
                            <div className="mt-2">
                              <a
                                href={job.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-[#3B82F6] hover:underline flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink size={14} />
                                View job posting
                              </a>
                            </div>
                          )}
                          <div className="mt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate('/application-lab');
                              }}
                              className="text-sm text-[#3B82F6] hover:underline font-medium"
                            >
                              Analyze in Application Lab →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            <div ref={messagesEndRef} />

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 border border-slate-200 rounded-[3px] p-3">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Scout is thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="px-6 py-4 border-t border-[#E2E8F0] bg-white">
          <div className="flex gap-3">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me anything about Offerloop..."
              className="flex-1 bg-white border-[#E2E8F0] text-slate-900 placeholder:text-slate-400 focus:border-[#3B82F6] focus-visible:ring-2 focus-visible:ring-[#3B82F6]/20 rounded-md text-base py-3"
              disabled={isLoading}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="hover:opacity-90 rounded-md px-5 py-3"
              style={{ background: 'linear-gradient(135deg, #0F172A, #1E293B)' }}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScoutHelperChatbot;

