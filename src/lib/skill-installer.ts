/**
 * Manages installation of Claude Code skills declared by extensions.
 *
 * Each extension can declare skills via the `skills` field on its Extension
 * definition. Skills are installed to ~/.claude/skills/ under the name
 * `conductor-<extensionId>-<slug>` so their origin is always clear.
 *
 * On startup, compares installed content against the bundled version and
 * prompts the user once for permission to install or update any that differ.
 */

import { extensionRegistry } from '@/extensions/registry'

interface PendingSkill {
  name: string
  content: string
}

/** Collects all skills declared by registered extensions. */
function getAllExtensionSkills(): PendingSkill[] {
  const skills: PendingSkill[] = []
  for (const ext of extensionRegistry.getAllExtensions()) {
    if (!ext.skills) continue
    for (const skill of ext.skills) {
      skills.push({
        name: `conductor-${ext.id}-${skill.slug}`,
        content: skill.content,
      })
    }
  }
  return skills
}

/** Returns skills that are missing or whose content differs from the bundled version. */
export async function getSkillsNeedingInstall(): Promise<PendingSkill[]> {
  const homeDir = await window.electronAPI.getHomeDir()
  const pending: PendingSkill[] = []
  for (const skill of getAllExtensionSkills()) {
    const skillPath = `${homeDir}/.claude/skills/${skill.name}/SKILL.md`
    try {
      const result = await window.electronAPI.readFile(skillPath)
      if (!result.success || result.content !== skill.content) {
        pending.push(skill)
      }
    } catch {
      pending.push(skill)
    }
  }
  return pending
}

/** Installs the given skills to ~/.claude/skills/. */
export async function installSkills(skills: PendingSkill[]): Promise<void> {
  for (const skill of skills) {
    await window.electronAPI.installSkill(skill.name, skill.content)
  }
}
