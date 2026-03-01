# Analyze + Visualize Feature Design
Date: 2026-03-01
Status: Approved

## Concept
Upload a photo of any second-hand object → Claude assesses its DIY lamp conversion
potential → Gemini 2.0 Flash generates a visualization of the finished lamp →
Claude provides step-by-step build instructions.

## User Flow
1. Upload photo → Confirm
2. **Analyzing** — Claude Haiku evaluates the object (not a lamp, an arbitrary find)
3. **Visualizing** — Gemini 2.0 Flash generates a lamp concept image
4. **Done** — Show: generated image, analysis card, build steps, "Try different approach" button
5. **Try different approach** — Re-analyze with a different conversion angle, re-visualize

## API Routes

### POST /api/analyze (rewritten)
- Input: `FormData { image: File, previousConcept?: string }`
- Model: `claude-haiku-4-5`
- Output: `{ object, material, suitability, conversionConcept, estimatedDifficulty, summary }`
- The prompt evaluates suitability for lamp conversion, NOT lamp attributes
- `previousConcept` causes Claude to pick a different conversion angle

### POST /api/visualize (new)
- Input: `JSON { conversionConcept: string, objectDescription: string }`
- Model: Gemini 2.0 Flash (`gemini-2.0-flash-exp`) via `@google/generative-ai`
- Output: `{ imageBase64: string }`
- Prompt: generate a photorealistic studio render of a DIY lamp made from the described object

### POST /api/build-steps (new)
- Input: `JSON { conversionConcept: string, object: string, material: string }`
- Model: `claude-haiku-4-5`
- Output: `{ steps: string[] }` — numbered DIY instructions

## Data Model Changes

```ts
// types/project.ts additions
conversionConcept?: string
visualizationDataUrl?: string   // base64 data URL from Gemini
buildSteps?: string[]
```

## UI Changes (PhotoPreview)

Loading states in sequence: saving → analyzing → visualizing → done

Done state shows:
- Generated lamp image (full width, rounded)
- Analysis card: object / material / suitability badge / difficulty badge / summary
- Build steps accordion (collapsed by default)
- "Try a different approach" button (re-runs analyze + visualize)
- "Replace photo" button

## Setup Required
- `GOOGLE_AI_API_KEY` from https://aistudio.google.com (free tier, no billing)
- npm package: `@google/generative-ai`
- Add key to `.env.local` and Vercel env vars
