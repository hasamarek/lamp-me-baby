// types/project.ts
// Shared project types used by the Zustand store and all components.
// Phase 2 will extend ProjectStatus and Project with analysis results.

export type ProjectStatus =
  | 'idle'        // Project created, no image yet
  | 'confirmed'   // Image stored in IndexedDB, ready to analyze
  | 'analyzing'   // Phase 2: AI call in progress (placeholder — not used in Phase 1)
  | 'analyzed'    // Phase 2: Attributes extracted
  | 'visualized'  // Phase 2: Visualization image generated

export interface Project {
  id: string                 // crypto.randomUUID()
  name: string               // Display name — derived from upload filename or timestamp
  imageDbKey: number | null  // Key into IndexedDB images store (from putImage return value)
  status: ProjectStatus
  createdAt: number          // Date.now() timestamp
  // Phase 2 fields
  attributes?: Record<string, string>   // raw analyze response
  conversionConcept?: string
  visualizationDataUrl?: string         // base64 data URL from Gemini
  buildSteps?: string[]
}
