---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.
license: Complete terms in LICENSE.txt
---

# Offerloop Frontend Design Guide

This project is Offerloop (offerloop.ai), a SaaS networking and outreach platform for college students.
Stack: React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Firebase.

## Existing Brand

- Keep the current font already in use across the app. Do not replace it unless explicitly asked.
- Maintain existing brand colors and extend them consistently using CSS variables.
- All new UI work should feel cohesive with what already exists.

## Design Thinking

Before coding any UI, understand the context and commit to a **bold** aesthetic direction:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick a clear direction: professional SaaS with warmth (Linear, Notion, Mercury — confident and clean, approachable for college students; not playful or childish); or other extremes when appropriate: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. Use these for inspiration but design something true to the chosen aesthetic.
- **Constraints**: React + TypeScript + Vite + Tailwind + shadcn/ui. Must be accessible and performant.
- **Differentiation**: What makes this interface **intentionally designed**, not AI-generated? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity.

Then implement working code that is:

- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics

- **Typography**: Use the project's existing fonts. Establish clear hierarchy through size, weight, and spacing. For new additions, choose fonts that are distinctive and characterful; pair a distinctive display font with a refined body font. Never default to Inter, Roboto, Arial, Space Grotesk, or system fonts.
- **Color & Theme**: Use CSS variables for consistency. Commit to a cohesive aesthetic. Dominant brand color with sharp accents; dominant colors with sharp accents outperform timid, evenly-distributed palettes. Never use purple gradients on white or other cliched AI color schemes.
- **Motion**: Use animations for page transitions and micro-interactions. One well-orchestrated page load with staggered reveals (e.g. `animation-delay`) creates more delight than scattered animations. CSS-first; use the Motion library for React when needed. Focus on high-impact moments: scroll-triggering and hover states that surprise.
- **Spatial Composition**: Intentional, unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density. Break grid patterns where it improves UX.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Use subtle textures, gradients, or layered transparencies. Add contextual effects that match the aesthetic: gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, grain overlays. Never default to flat solid white or gray.

## What to NEVER Do

- Generic "AI slop" aesthetics
- Overused fonts (Inter, Roboto, Space Grotesk, Arial, system fonts)
- Cliched color schemes (especially purple gradients on white)
- Predictable card grid layouts with no variation
- Cookie-cutter components that lack context-specific character
- Ignoring the existing design system
- Converging on the same fonts, palette, or layout across generations — vary between light and dark themes, different fonts, different aesthetics

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same.

## Component Rules

- Use shadcn/ui as the base. Customize to match the design system.
- All components must be TypeScript with proper types.
- Mobile-responsive with Tailwind breakpoints.
- Pages in `src/pages/`, components in `src/components/`, shadcn primitives in `src/components/ui/`
- Hooks in `src/hooks/`, types in `src/types/`, API calls in `src/services/`

## Implementation

Match implementation complexity to the aesthetic vision. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Maximalist designs need elaborate animations and effects. Elegance comes from executing the vision well — execute fully, no half measures.

Commit to a distinctive vision and show what can be created when thinking outside the box.
