// connect-grow-hire/src/components/find/PromptTemplates.tsx
// RocketReach-style "if you need ideas" row: category tabs + fill-in-the-blank
// templates. Blanks are inline inputs; the search icon composes and submits.
import { useState } from "react";
import { Search } from "lucide-react";
import {
  SearchTemplate, TemplateCategory, TemplatePart,
} from "@/data/searchTemplates";

function isBlank(p: TemplatePart): p is Exclude<TemplatePart, string> {
  return typeof p !== "string";
}

function TemplateRow({ template, onSubmit, disabled }: {
  template: SearchTemplate; onSubmit: (prompt: string) => void; disabled?: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const complete = template.parts.every((p) => !isBlank(p) || (values[p.key] ?? "").trim());

  const compose = () =>
    template.parts.map((p) => (isBlank(p) ? (values[p.key] ?? "").trim() : p)).join("");

  return (
    <div
      className="flex items-center justify-between"
      style={{
        gap: 10, padding: "9px 12px", borderRadius: 10,
        background: "var(--paper-2, #FAFBFF)", border: "1px solid var(--line, #E8E8E8)",
      }}
    >
      <div className="flex items-center flex-wrap" style={{ gap: 4, fontSize: 13.5, color: "var(--ink, #111318)" }}>
        {template.parts.map((p, i) =>
          isBlank(p) ? (
            <input
              key={`${p.key}-${i}`}
              value={values[p.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [p.key]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter" && complete && !disabled) onSubmit(compose()); }}
              placeholder={p.placeholder}
              size={Math.max((values[p.key] ?? p.placeholder).length, 6)}
              style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 12.5, fontFamily: "inherit",
                border: "none", outline: "none",
                background: "var(--primary-50, #EEF1F9)", color: "var(--accent, #4A60A8)",
              }}
            />
          ) : (
            <span key={i}>{p}</span>
          )
        )}
      </div>
      <button
        type="button"
        disabled={!complete || disabled}
        onClick={() => onSubmit(compose())}
        aria-label="Search this template"
        style={{
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          width: 30, height: 30, borderRadius: 8, cursor: complete && !disabled ? "pointer" : "default",
          border: "1px solid var(--line, #E8E8E8)",
          background: complete && !disabled ? "var(--accent, #4A60A8)" : "#fff",
          color: complete && !disabled ? "#fff" : "var(--ink-3, #94A3B8)",
        }}
      >
        <Search style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
}

export function PromptTemplates({ categories, onSubmit, disabled }: {
  categories: TemplateCategory[]; onSubmit: (prompt: string) => void; disabled?: boolean;
}) {
  const [activeCat, setActiveCat] = useState(categories[0]?.id);
  const cat = categories.find((c) => c.id === activeCat) ?? categories[0];
  if (!cat) return null;

  return (
    <div className="flex flex-col sm:flex-row" style={{ gap: 14 }}>
      {categories.length > 1 && (
        <div className="flex flex-row sm:flex-col" style={{ gap: 3, flexShrink: 0 }}>
          {categories.map((c) => {
            const active = c.id === activeCat;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCat(c.id)}
                style={{
                  padding: "7px 14px", borderRadius: 8, fontSize: 13, textAlign: "left",
                  fontWeight: active ? 600 : 500, fontFamily: "inherit", cursor: "pointer",
                  border: active ? "1px solid var(--accent, #4A60A8)" : "1px solid transparent",
                  background: active ? "#fff" : "transparent",
                  color: active ? "var(--accent, #4A60A8)" : "var(--ink-2, #475569)",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-col flex-1 min-w-0" style={{ gap: 7 }}>
        {cat.templates.map((t) => (
          <TemplateRow key={t.id} template={t} onSubmit={onSubmit} disabled={disabled} />
        ))}
      </div>
    </div>
  );
}
