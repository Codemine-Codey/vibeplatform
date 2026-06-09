export interface SavedProject {
  id: string // sandboxId
  name: string
  skill: 'website' | 'webapp' | 'game' | 'unknown'
  url?: string
  createdAt: number
}

const KEY = 'cm_projects'
export const MAX_PROJECTS = 10

export function loadProjects(): SavedProject[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function saveProject(project: SavedProject): void {
  if (typeof window === 'undefined') return
  const existing = loadProjects().filter(p => p.id !== project.id)
  const updated = [project, ...existing].slice(0, MAX_PROJECTS)
  localStorage.setItem(KEY, JSON.stringify(updated))
}

export function deleteProject(id: string): void {
  if (typeof window === 'undefined') return
  const updated = loadProjects().filter(p => p.id !== id)
  localStorage.setItem(KEY, JSON.stringify(updated))
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(diff / 86400000)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}
