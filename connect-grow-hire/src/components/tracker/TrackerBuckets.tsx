import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { OutboxThread } from "@/services/api";
import { ContactCard, type BucketType } from "./ContactCard";

interface TrackerBucketsProps {
  needsAttention: OutboxThread[];
  waiting: OutboxThread[];
  done: OutboxThread[];
  selectedContactId: string | null;
  onSelectContact: (id: string) => void;
}

interface BucketSectionProps {
  title: string;
  bucket: BucketType;
  contacts: OutboxThread[];
  accent: string;
  badgeBg: string;
  badgeText: string;
  emptyMessage: string;
  defaultOpen: boolean;
  selectedContactId: string | null;
  onSelectContact: (id: string) => void;
}

function BucketSection({
  title,
  bucket,
  contacts,
  accent,
  badgeBg,
  badgeText,
  emptyMessage,
  defaultOpen,
  selectedContactId,
  onSelectContact,
}: BucketSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const userToggled = useRef(false);

  // Sync with defaultOpen prop unless the user has manually toggled
  useEffect(() => {
    if (!userToggled.current) setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <div>
      <button
        onClick={() => { userToggled.current = true; setOpen(!open); }}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-gray-50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        )}
        <span className={`text-xs font-semibold tracking-wide uppercase ${accent}`}>
          {title}
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badgeBg} ${badgeText}`}>
          {contacts.length}
        </span>
      </button>

      {open && (
        <div className="mt-1 space-y-0.5">
          {contacts.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-3">{emptyMessage}</p>
          ) : (
            contacts.map((c) => (
              <ContactCard
                key={c.id}
                contact={c}
                bucket={bucket}
                isSelected={c.id === selectedContactId}
                onClick={() => onSelectContact(c.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function TrackerBuckets({
  needsAttention,
  waiting,
  done,
  selectedContactId,
  onSelectContact,
}: TrackerBucketsProps) {
  return (
    <div className="space-y-3">
      <BucketSection
        title="Needs Attention"
        bucket="needsAttention"
        contacts={needsAttention}
        accent={needsAttention.length > 0 ? "text-orange-600" : "text-gray-500"}
        badgeBg={needsAttention.length > 0 ? "bg-orange-100" : "bg-gray-100"}
        badgeText={needsAttention.length > 0 ? "text-orange-700" : "text-gray-500"}
        emptyMessage="You're all caught up"
        defaultOpen={true}
        selectedContactId={selectedContactId}
        onSelectContact={onSelectContact}
      />

      <BucketSection
        title="Waiting"
        bucket="waiting"
        contacts={waiting}
        accent="text-[#3B82F6]"
        badgeBg="bg-[rgba(59,130,246,0.10)]"
        badgeText="text-[#2563EB]"
        emptyMessage="No emails sent yet - find contacts to reach out to"
        defaultOpen={true}
        selectedContactId={selectedContactId}
        onSelectContact={onSelectContact}
      />

      <BucketSection
        title="Done"
        bucket="done"
        contacts={done}
        accent="text-green-600"
        badgeBg="bg-green-100"
        badgeText="text-green-700"
        emptyMessage="Completed conversations will appear here"
        defaultOpen={done.length <= 5}
        selectedContactId={selectedContactId}
        onSelectContact={onSelectContact}
      />
    </div>
  );
}
