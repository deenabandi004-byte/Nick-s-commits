import React from 'react';
import type { PromptCardData } from '@/types/promptCard';

interface PromptCardProps {
  item: PromptCardData;
  onSelect: (prompt: string) => void;
}

export const PromptCard: React.FC<PromptCardProps> = ({ item, onSelect }) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.prompt)}
      className="prompt-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        border: '1px solid #E5E3DE',
        borderRadius: 8,
        padding: 14,
        minHeight: 88,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        transition: 'border-color .15s ease, transform .15s ease',
        width: '100%',
      }}
    >
      <div
        style={{
          fontFamily: "var(--serif, 'Instrument Serif', Georgia, serif)",
          fontStyle: 'italic',
          fontSize: 15,
          lineHeight: 1.4,
          color: 'var(--ink, #111418)',
          flex: 1,
        }}
      >
        &ldquo;{item.prompt}&rdquo;
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9.5,
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          color: '#94A3B8',
          marginTop: 'auto',
          paddingTop: 8,
        }}
      >
        {item.hint}
      </div>

      <style>{`
        .prompt-card:hover {
          border-color: #1E293B !important;
          transform: translateY(-1px);
        }
        .prompt-card:focus-visible {
          outline: 2px solid var(--st-accent, #1E293B);
          outline-offset: 2px;
        }
      `}</style>
    </button>
  );
};
