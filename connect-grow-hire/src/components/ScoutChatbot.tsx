// src/components/ScoutChatbot.tsx
import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Sparkles, ArrowUp } from 'lucide-react';

interface ScoutChatbotProps {
  onJobTitleSuggestion: (jobTitle: string) => void;
}

interface Message {
  id: number;
  type: string;
  content: string;
  jobTitle?: string | null;
  timestamp: Date;
}

const ScoutChatbot: React.FC<ScoutChatbotProps> = ({ onJobTitleSuggestion }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      type: 'bot',
      content: "Hi! I'm Scout 🕵️ I'll help you find the perfect job title to search for. What company are you interested in?",
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversation, setConversation] = useState({
    company: '',
    jobType: '',
    level: '',
    department: ''
  });
  const [step, setStep] = useState('company'); // company -> jobType -> level -> suggestions
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const addMessage = (content: string, type: string = 'user', jobTitle: string | null = null) => {
    const newMessage: Message = {
      id: Date.now(),
      type,
      content,
      jobTitle, // Store the job title for suggestion messages
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const simulateTyping = (callback: () => void) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      callback();
    }, 1000 + Math.random() * 1000);
  };

  const generateJobTitleSuggestions = async (company: string, jobType: string, level: string): Promise<string[]> => {
    try {
      console.log(`🤖 Scout: Using OpenAI to generate suggestions for ${level} ${jobType} at ${company}...`);
      
      // Call our OpenAI-powered endpoint - UPDATE THIS URL
      const response = await fetch('https://offshore-direct-linked-brass.trycloudflare.com/api/scout-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company: company,
          jobType: jobType,
          level: level
        })
      });

      if (response.ok) {
        const suggestionData = await response.json();
        console.log(`✅ OpenAI suggestions received:`, suggestionData);
        
        if (suggestionData.suggestions && suggestionData.suggestions.length > 0) {
          return suggestionData.suggestions;
        }
      } else {
        console.warn('⚠️ OpenAI suggestions failed, falling back to static suggestions');
      }
    } catch (error) {
      console.error('❌ Error calling OpenAI suggestions:', error);
    }

    // Fallback to our basic database if OpenAI fails
    return getBasicTitleSuggestions(jobType, level);
  };

  const getBasicTitleSuggestions = (jobType: string, level: string): string[] => {
    const basicTitles: Record<string, Record<string, string[]>> = {
      'engineering': {
        'entry': ['Software Engineer', 'Junior Software Engineer', 'Software Engineer I', 'Associate Software Engineer'],
        'mid': ['Software Engineer II', 'Senior Software Engineer', 'Full Stack Engineer', 'Backend Engineer'],
        'senior': ['Staff Software Engineer', 'Principal Engineer', 'Lead Software Engineer', 'Senior Staff Engineer'],
        'manager': ['Engineering Manager', 'Senior Engineering Manager', 'Director of Engineering', 'VP of Engineering']
      },
      'product': {
        'entry': ['Product Manager', 'Associate Product Manager', 'Junior Product Manager', 'Product Analyst'],
        'mid': ['Senior Product Manager', 'Product Manager II', 'Lead Product Manager', 'Principal Product Manager'],
        'senior': ['Staff Product Manager', 'Principal Product Manager', 'Senior Principal PM', 'Distinguished PM'],
        'manager': ['Director of Product', 'VP of Product', 'Head of Product', 'Chief Product Officer']
      },
      'marketing': {
        'entry': ['Marketing Manager', 'Marketing Specialist', 'Digital Marketing Manager', 'Marketing Coordinator'],
        'mid': ['Senior Marketing Manager', 'Product Marketing Manager', 'Growth Marketing Manager', 'Brand Manager'],
        'senior': ['Principal Marketing Manager', 'Lead Marketing Manager', 'Marketing Director', 'Senior Brand Manager'],
        'manager': ['Director of Marketing', 'VP of Marketing', 'Head of Marketing', 'Chief Marketing Officer']
      },
      'sales': {
        'entry': ['Account Executive', 'Sales Development Representative', 'Business Development Representative', 'Sales Associate'],
        'mid': ['Senior Account Executive', 'Sales Manager', 'Enterprise Account Executive', 'Strategic Account Manager'],
        'senior': ['Principal Account Executive', 'Lead Sales Manager', 'Senior Sales Director', 'Key Account Manager'],
        'manager': ['Sales Director', 'VP of Sales', 'Head of Sales', 'Chief Revenue Officer']
      },
      'data': {
        'entry': ['Data Scientist', 'Data Analyst', 'Junior Data Scientist', 'Business Analyst'],
        'mid': ['Senior Data Scientist', 'Machine Learning Engineer', 'Data Science Manager', 'Senior Data Analyst'],
        'senior': ['Principal Data Scientist', 'Staff Data Scientist', 'Lead Data Scientist', 'Distinguished Scientist'],
        'manager': ['Director of Data Science', 'VP of Data', 'Head of Analytics', 'Chief Data Officer']
      },
      'design': {
        'entry': ['UX Designer', 'UI Designer', 'Product Designer', 'Visual Designer'],
        'mid': ['Senior UX Designer', 'Senior Product Designer', 'Lead Designer', 'Design Manager'],
        'senior': ['Staff Designer', 'Principal Designer', 'Lead Product Designer', 'Design Director'],
        'manager': ['Design Manager', 'Director of Design', 'VP of Design', 'Head of Design']
      },
      'finance': {
        'entry': ['Financial Analyst', 'Investment Analyst', 'Junior Financial Analyst', 'Accounting Associate'],
        'mid': ['Senior Financial Analyst', 'Finance Manager', 'Investment Associate', 'Senior Analyst'],
        'senior': ['Principal Financial Analyst', 'Senior Finance Manager', 'Finance Director', 'Investment Director'],
        'manager': ['Finance Director', 'VP of Finance', 'CFO', 'Head of Finance']
      },
      'operations': {
        'entry': ['Operations Manager', 'Business Operations Analyst', 'Operations Coordinator', 'Program Coordinator'],
        'mid': ['Senior Operations Manager', 'Business Operations Manager', 'Program Manager', 'Operations Lead'],
        'senior': ['Principal Operations Manager', 'Lead Program Manager', 'Operations Director', 'Senior Program Manager'],
        'manager': ['Director of Operations', 'VP of Operations', 'Head of Operations', 'Chief Operating Officer']
      }
    };

    return basicTitles[jobType]?.[level] || ['Software Engineer', 'Product Manager', 'Marketing Manager', 'Sales Manager'];
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage.trim();
    addMessage(userMessage, 'user');
    setInputMessage('');

    // Process the conversation based on current step
    if (step === 'company') {
      setConversation(prev => ({ ...prev, company: userMessage }));
      
      simulateTyping(() => {
        addMessage("Perfect! What type of role are you looking for? (e.g., engineering, product, marketing, sales, data, design, finance, operations)", 'bot');
        setStep('jobType');
      });
    } 
    else if (step === 'jobType') {
      const normalizedJobType = userMessage.toLowerCase();
      let detectedType = 'engineering'; // default
      
      if (normalizedJobType.includes('engineer') || normalizedJobType.includes('tech') || normalizedJobType.includes('software') || normalizedJobType.includes('developer')) {
        detectedType = 'engineering';
      } else if (normalizedJobType.includes('product')) {
        detectedType = 'product';
      } else if (normalizedJobType.includes('market')) {
        detectedType = 'marketing';
      } else if (normalizedJobType.includes('sales') || normalizedJobType.includes('business dev')) {
        detectedType = 'sales';
      } else if (normalizedJobType.includes('data') || normalizedJobType.includes('analyst') || normalizedJobType.includes('science')) {
        detectedType = 'data';
      } else if (normalizedJobType.includes('design') || normalizedJobType.includes('ux') || normalizedJobType.includes('ui')) {
        detectedType = 'design';
      } else if (normalizedJobType.includes('finance') || normalizedJobType.includes('accounting') || normalizedJobType.includes('investment')) {
        detectedType = 'finance';
      } else if (normalizedJobType.includes('operations') || normalizedJobType.includes('ops')) {
        detectedType = 'operations';
      }
      
      setConversation(prev => ({ ...prev, jobType: detectedType }));
      
      simulateTyping(() => {
        addMessage("Got it! What level are you targeting? (entry, mid, senior, manager)", 'bot');
        setStep('level');
      });
    }
    else if (step === 'level') {
      const normalizedLevel = userMessage.toLowerCase();
      let detectedLevel = 'mid'; // default
      
      if (normalizedLevel.includes('entry') || normalizedLevel.includes('junior') || normalizedLevel.includes('new grad') || normalizedLevel.includes('associate')) {
        detectedLevel = 'entry';
      } else if (normalizedLevel.includes('senior') || normalizedLevel.includes('lead') || normalizedLevel.includes('principal') || normalizedLevel.includes('staff')) {
        detectedLevel = 'senior';
      } else if (normalizedLevel.includes('manager') || normalizedLevel.includes('director') || normalizedLevel.includes('head') || normalizedLevel.includes('vp')) {
        detectedLevel = 'manager';
      }
      
      const finalConversation = { ...conversation, level: detectedLevel };
      setConversation(finalConversation);
      
      simulateTyping(async () => {
        // FIXED: Properly await the async function
        const suggestions = await generateJobTitleSuggestions(finalConversation.company, finalConversation.jobType, detectedLevel);
        
        addMessage(`Perfect! Based on your interest in ${finalConversation.jobType} roles at ${finalConversation.company}, here are the most common job titles to search for:`, 'bot');
        
        setTimeout(() => {
          suggestions.forEach((title, index) => {
            setTimeout(() => {
              // Create the message with the clean title stored separately
              const newMessage: Message = {
                id: Date.now(),
                type: 'suggestion',
                content: `${index + 1}. ${title}`,
                jobTitle: title, // Store the clean job title
                timestamp: new Date()
              };
              setMessages(prev => [...prev, newMessage]);
            }, index * 300);
          });
          
          setTimeout(() => {
            addMessage("Click any suggestion above to use it in your search, or ask me to find more specific titles! 🎯", 'bot');
          }, suggestions.length * 300 + 500);
        }, 1000);
        
        setStep('suggestions');
      });
    }
    else if (step === 'suggestions') {
      // Handle follow-up questions
      simulateTyping(() => {
        addMessage("Let me help you refine that search! What specific aspects of the role are you most interested in?", 'bot');
      });
    }
  };

  const handleSuggestionClick = (jobTitle: string | null | undefined) => {
    if (onJobTitleSuggestion && jobTitle) {
      onJobTitleSuggestion(jobTitle);
    }
    addMessage(`Great choice! I've filled in "${jobTitle}" for you. You can now complete your search! 🚀`, 'bot');
  };

  const resetConversation = () => {
    setMessages([
      {
        id: 1,
        type: 'bot',
        content: "Hi! I'm Scout 🕵️ I'll help you find the perfect job title to search for. What company are you interested in?",
        timestamp: new Date()
      }
    ]);
    setConversation({ company: '', jobType: '', level: '', department: '' });
    setStep('company');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center"
          aria-label="Open Scout Chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat Widget */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-96 h-[600px] flex flex-col bg-card border border-border rounded-lg shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Scout</h3>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-accent rounded transition-colors"
              aria-label="Close Scout Chat"
            >
              <X className="h-5 w-5 text-foreground" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded-lg text-sm ${
                    message.type === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : message.type === 'suggestion'
                      ? 'bg-muted text-green-600 dark:text-green-400 border border-border cursor-pointer hover:bg-accent transition-colors rounded-bl-sm'
                      : 'bg-muted text-foreground rounded-bl-sm border border-border'
                  }`}
                  onClick={message.type === 'suggestion' && message.jobTitle ? () => handleSuggestionClick(message.jobTitle) : undefined}
                >
                  {message.content}
                  {message.type === 'suggestion' && (
                    <div className="mt-1 text-xs text-green-600 dark:text-green-400 flex items-center">
                      <ArrowUp className="w-3 h-3 mr-1" />
                      Click to use
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-muted text-foreground p-3 rounded-lg rounded-bl-sm max-w-[80%] border border-border">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-border bg-background">
            <div className="flex space-x-2">
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm text-foreground placeholder-muted-foreground"
                disabled={isTyping}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isTyping}
                className="bg-primary hover:bg-primary/90 text-primary-foreground p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={resetConversation}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ScoutChatbot;
