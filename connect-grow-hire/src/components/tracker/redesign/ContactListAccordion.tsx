import { ProtoContactCard } from "./ProtoContactCard";
import { GroupSection } from "./GroupSection";
import {
  PROTO_STAGES,
  PROTO_STAGE_LABELS,
  type GroupedByStage,
  type ProtoStage,
} from "@/pages/trackerAdapter";

interface ContactListAccordionProps {
  grouped: GroupedByStage;
  openGroups: Record<ProtoStage, boolean>;
  selectedContactId: string | null;
  onToggleGroup: (stage: ProtoStage) => void;
  onSelectContact: (id: string) => void;
}

export function ContactListAccordion({
  grouped,
  openGroups,
  selectedContactId,
  onToggleGroup,
  onSelectContact,
}: ContactListAccordionProps) {
  return (
    <div className="groups-root">
      {PROTO_STAGES.map((stage) => {
        const contacts = grouped[stage];
        return (
          <GroupSection
            key={stage}
            label={PROTO_STAGE_LABELS[stage]}
            count={contacts.length}
            isOpen={openGroups[stage]}
            onToggle={() => onToggleGroup(stage)}
          >
            {contacts.map((c) => (
              <ProtoContactCard
                key={c.id}
                contact={c}
                isSelected={c.id === selectedContactId}
                onSelect={() => onSelectContact(c.id)}
              />
            ))}
          </GroupSection>
        );
      })}
    </div>
  );
}
