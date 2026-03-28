import { useProjectStore } from '@/store/project'
import { resolveSettings } from '@/types/project-settings'

/** Returns fully-resolved settings (workspace > project > defaults). */
export function useResolvedSettings() {
  const projectSettings = useProjectStore(s => s.projectSettings)
  const workspaceSettings = useProjectStore(s => s.workspaceSettings)
  return resolveSettings(projectSettings, workspaceSettings)
}
