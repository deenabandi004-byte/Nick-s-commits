import React from "react";
import { ArchiveRow } from "./ArchiveRow";

export interface ArchiveItem {
  company: string;
  sentence: string;
  sector: string;
}

interface ArchiveListProps {
  items: ArchiveItem[];
  onSelect: (company: string) => void;
}

export const ArchiveList: React.FC<ArchiveListProps> = ({ items, onSelect }) => {
  if (items.length === 0) return null;

  return (
    <div
      style={{
        border: "1px solid var(--line, #E5E5E0)",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      {items.map((item, i) => (
        <ArchiveRow
          key={item.company}
          num={String(i + 1).padStart(2, "0")}
          name={item.company}
          sentence={item.sentence}
          sector={item.sector}
          onClick={() => onSelect(item.company)}
        />
      ))}
    </div>
  );
};
