// connect-grow-hire/src/data/searchTemplates.ts
// Fill-in-the-blank starter prompts (Find page empty state). A template is a
// sentence with typed blanks; PromptTemplates renders blanks as inline inputs
// and composes the final prompt string.

export interface TemplateBlank { key: string; placeholder: string; example: string; }
export type TemplatePart = string | TemplateBlank;
export interface SearchTemplate { id: string; parts: TemplatePart[]; }
export interface TemplateCategory { id: string; label: string; templates: SearchTemplate[]; }

export const PEOPLE_TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: "general", label: "General",
    templates: [
      { id: "g1", parts: ["I'm looking for ", { key: "title", placeholder: "job title", example: "product managers" }, " at ", { key: "company", placeholder: "company", example: "Airbnb" }] },
      { id: "g2", parts: [{ key: "school", placeholder: "school", example: "USC" }, " alumni working in ", { key: "industry", placeholder: "industry", example: "tech" }] },
      { id: "g3", parts: ["Recruiters hiring ", { key: "title", placeholder: "job title", example: "software engineering" }, " interns in ", { key: "location", placeholder: "location", example: "New York" }] },
    ],
  },
  {
    id: "consulting", label: "Consulting",
    templates: [
      { id: "c1", parts: ["Consultants at ", { key: "company", placeholder: "firm", example: "McKinsey" }, " in ", { key: "location", placeholder: "location", example: "Chicago" }] },
      { id: "c2", parts: [{ key: "school", placeholder: "school", example: "Michigan" }, " alumni at MBB firms"] },
      { id: "c3", parts: ["Recruiters at ", { key: "company", placeholder: "firm", example: "Bain" }, " hiring for ", { key: "title", placeholder: "program", example: "summer associate" }] },
    ],
  },
  {
    id: "banking", label: "Banking",
    templates: [
      { id: "b1", parts: ["Investment banking analysts at ", { key: "company", placeholder: "bank", example: "Goldman Sachs" }] },
      { id: "b2", parts: [{ key: "school", placeholder: "school", example: "NYU" }, " alumni in ", { key: "group", placeholder: "group", example: "M&A" }, " at ", { key: "company", placeholder: "bank", example: "JPMorgan" }] },
      { id: "b3", parts: ["IB associates in ", { key: "location", placeholder: "city", example: "San Francisco" }, " who went to ", { key: "school", placeholder: "school", example: "Georgetown" }] },
    ],
  },
  {
    id: "tech", label: "Tech",
    templates: [
      { id: "t1", parts: [{ key: "title", placeholder: "role", example: "Software engineers" }, " at ", { key: "company", placeholder: "company", example: "Google" }] },
      { id: "t2", parts: ["APM program managers at ", { key: "company", placeholder: "company", example: "Meta" }] },
      { id: "t3", parts: [{ key: "school", placeholder: "school", example: "UCLA" }, " alumni who joined ", { key: "company", placeholder: "company", example: "startups" }, " as ", { key: "title", placeholder: "role", example: "designers" }] },
    ],
  },
];

export const COMPANY_TEMPLATES: SearchTemplate[] = [
  { id: "f1", parts: [{ key: "size", placeholder: "size", example: "Mid-sized" }, " ", { key: "industry", placeholder: "industry", example: "investment banks" }, " in ", { key: "location", placeholder: "location", example: "New York" }] },
  { id: "f2", parts: [{ key: "industry", placeholder: "industry", example: "Consulting firms" }, " focused on ", { key: "focus", placeholder: "specialty", example: "healthcare" }] },
  { id: "f3", parts: ["Startups in ", { key: "location", placeholder: "location", example: "Los Angeles" }, " hiring ", { key: "role", placeholder: "role", example: "new grads" }] },
];
