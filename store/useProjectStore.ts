'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project, ProjectStatus } from '@/types/project'

interface ProjectStore {
  projects: Project[]
  currentProjectId: string | null

  // Add a new project and return its generated ID
  addProject: (name: string) => string

  // Set the active project for the current session
  setCurrentProject: (id: string) => void

  // Patch any subset of fields on an existing project
  updateProject: (id: string, patch: Partial<Omit<Project, 'id' | 'createdAt'>>) => void

  // Remove a project (used when user cancels before confirming image)
  removeProject: (id: string) => void
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      projects: [],
      currentProjectId: null,

      addProject: (name) => {
        const id = crypto.randomUUID()
        set((state) => ({
          projects: [
            ...state.projects,
            {
              id,
              name,
              imageDbKey: null,
              status: 'idle' as ProjectStatus,
              createdAt: Date.now(),
            },
          ],
          currentProjectId: id,
        }))
        return id
      },

      setCurrentProject: (id) => set({ currentProjectId: id }),

      updateProject: (id, patch) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...patch } : p
          ),
        })),

      removeProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProjectId:
            state.currentProjectId === id ? null : state.currentProjectId,
        })),
    }),
    {
      name: 'lamp-me-baby-projects', // localStorage key
      // Only persist the projects array and currentProjectId
      // (omit transient session state if added in future)
      partialize: (state) => ({
        projects: state.projects,
        currentProjectId: state.currentProjectId,
      }),
    }
  )
)

/*
 * SSR Hydration Guard (use in any component that reads persisted state):
 *
 * const [hydrated, setHydrated] = useState(false)
 * useEffect(() => setHydrated(true), [])
 * if (!hydrated) return <div className="animate-pulse h-24 bg-gray-100 rounded" />
 *
 * This prevents React hydration mismatch because localStorage doesn't exist on the server.
 */
