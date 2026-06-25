import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { apiService, type SearchSuggestion } from "@/services/api";

interface SmartSuggestionsProps {
  onSelect: (suggestion: SearchSuggestion) => void;
  disabled?: boolean;
  hidden?: boolean;
}

export function SmartSuggestions({ onSelect, disabled, hidden }: SmartSuggestionsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["smartSearchSuggestions"],
    queryFn: async () => {
      const res = await apiService.getSearchSuggestions();
      if ("error" in res) return [];
      return res.suggestions ?? [];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (hidden || isLoading || !data || data.length === 0) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 8,
        fontSize: 11,
        fontWeight: 600,
        color: "var(--ink-2)",
        textTransform: "uppercase" as const,
        letterSpacing: "0.04em",
      }}>
        Suggested for you
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {data.map((suggestion, i) => (
          <button
            key={i}
            disabled={disabled}
            onClick={() => onSelect(suggestion)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid var(--warm-border, #E8E4DE)",
              background: "var(--warm-surface, #FAFBFF)",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.5 : 1,
              transition: "all .15s",
              maxWidth: "100%",
              fontFamily: "inherit",
            }}
            className="hover:border-[#3B82F6] hover:bg-blue-50/40"
          >
            <div style={{ textAlign: "left", minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--ink)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {suggestion.title}
              </div>
              <div style={{
                fontSize: 11,
                color: "var(--ink-3)",
                marginTop: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {suggestion.reason}
              </div>
            </div>
            <ArrowRight style={{
              width: 12,
              height: 12,
              color: "var(--ink-3)",
              flexShrink: 0,
            }} />
          </button>
        ))}
      </div>
    </div>
  );
}
