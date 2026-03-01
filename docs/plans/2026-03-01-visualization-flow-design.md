# Visualization Flow Design

**Date:** 2026-03-01
**Status:** Approved

## Goal

After photo analysis completes, automatically navigate to a results page that generates and displays a Gemini lamp render alongside the analysis attributes.

## Flow

```
Upload → PhotoPreview → [save + analyze] → navigate to /project/[id]
                                                       ↓
                                          ResultsPage mounts
                                          reads project from store
                                          calls /api/visualize
                                          shows attributes immediately
                                          shows render when ready
```

## Files

| File | Change |
|------|--------|
| `components/upload/PhotoPreview.tsx` | After `status === 'analyzed'`, call `router.push('/project/' + projectId)` |
| `app/project/[id]/page.tsx` | New — thin Next.js page wrapper |
| `components/results/ResultsView.tsx` | New — renders lamp image + attributes, triggers visualization |
| `app/api/visualize/route.ts` | Already exists, no changes needed |

## ResultsView Behaviour

1. Reads project from Zustand store by `id`
2. If project already has `visualizationDataUrl` — show it immediately, skip fetch
3. Otherwise: POST `/api/visualize` with `{ conversionConcept, objectDescription: "${object} made of ${material}" }`
4. While generating: pulsing skeleton placeholder with "Rendering your lamp…"
5. On success: store `visualizationDataUrl` on project, update `status: 'visualized'`
6. On error: show retry button

## Layout

```
┌──────────────────────────────────────┐
│  [lamp render image — full width]    │
│  (or pulsing skeleton while loading) │
├──────────────────────────────────────┤
│  Object: vintage vase                │
│  Material: ceramic                   │
│  Concept: Thread cord through base…  │
│  Difficulty: easy                    │
│  Suitability: high                   │
│                                      │
│  [summary text]                      │
├──────────────────────────────────────┤
│  [← Try another]  [Regenerate]       │
└──────────────────────────────────────┘
```

## Data Assembly

`objectDescription` for the visualize prompt is assembled as:
```
"${attributes.object} made of ${attributes.material}"
```

`conversionConcept` comes directly from `attributes.conversionConcept`.

## Regenerate

Clicking Regenerate re-calls `/api/visualize` (subject to rate limit). The new image overwrites `visualizationDataUrl` in the store.
