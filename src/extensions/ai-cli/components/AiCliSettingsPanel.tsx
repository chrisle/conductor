import React, { useState } from 'react'
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useClaudeCodeSettings } from '../contexts/useClaudeCodeSettings'
import { useCodexSettings } from '../contexts/useCodexSettings'
import { useConfigStore } from '@/store/config'
import { nanoid } from '@/lib/nanoid'

export default function AiCliSettingsPanel(): React.ReactElement {
  const claudeCode = useClaudeCodeSettings()
  const codex = useCodexSettings()
  const accounts = useConfigStore(s => s.config.claudeAccounts)
  const addAccount = useConfigStore(s => s.addClaudeAccount)
  const removeAccount = useConfigStore(s => s.removeClaudeAccount)
  const [newName, setNewName] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newKeyVisible, setNewKeyVisible] = useState(false)
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())

  function toggleKeyVisibility(id: string) {
    setVisibleKeys(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAddAccount() {
    const name = newName.trim()
    const key = newKey.trim()
    if (!name || !key) return
    await addAccount({ id: nanoid(), name, apiKey: key })
    setNewName('')
    setNewKey('')
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Claude Accounts */}
      <div className="flex flex-col gap-4">
        <div className="text-ui-sm text-zinc-500 uppercase tracking-wider">Claude Accounts</div>
        <div className="text-ui-sm text-zinc-500">
          Add API keys to choose between accounts when creating new Claude tabs.
        </div>

        {accounts.map(account => (
          <div key={account.id} className="flex items-center gap-2">
            <span className="text-ui-base text-zinc-300 min-w-[80px] truncate">{account.name}</span>
            <div className="flex-1 flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1">
              <span className="text-ui-sm text-zinc-500 font-mono truncate flex-1">
                {visibleKeys.has(account.id) ? account.apiKey : '•'.repeat(Math.min(account.apiKey.length, 24))}
              </span>
              <button
                onClick={() => toggleKeyVisibility(account.id)}
                className="text-zinc-500 hover:text-zinc-300 shrink-0"
              >
                {visibleKeys.has(account.id)
                  ? <EyeOff className="w-3 h-3" />
                  : <Eye className="w-3 h-3" />}
              </button>
            </div>
            <button
              onClick={() => removeAccount(account.id)}
              className="text-zinc-500 hover:text-red-400 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-ui-xs text-zinc-500">Name</label>
            <input
              type="text"
              placeholder="e.g. Work"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-24 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-ui-base text-zinc-200 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-ui-xs text-zinc-500">API Key</label>
            <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1">
              <input
                type={newKeyVisible ? 'text' : 'password'}
                placeholder="sk-ant-..."
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddAccount()}
                className="flex-1 bg-transparent text-ui-base text-zinc-200 focus:outline-none"
              />
              <button
                onClick={() => setNewKeyVisible(v => !v)}
                className="text-zinc-500 hover:text-zinc-300 shrink-0"
              >
                {newKeyVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 shrink-0"
            onClick={handleAddAccount}
            disabled={!newName.trim() || !newKey.trim()}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="w-full h-px bg-zinc-800" />

      <div className="flex flex-col gap-4">
        <div className="text-ui-sm text-zinc-500 uppercase tracking-wider">Claude Code</div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-ui-base font-medium text-zinc-200">Allow yolo mode</div>
            <div className="text-ui-sm text-zinc-500 mt-0.5">
              Passes --allow-dangerously-skip-permissions so Claude can skip permission prompts when asked
            </div>
          </div>
          <Switch
            checked={claudeCode.allowYoloMode}
            onCheckedChange={(v) => claudeCode.update({ allowYoloMode: v, yoloModeByDefault: v ? claudeCode.yoloModeByDefault : false })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-ui-base font-medium text-zinc-200">Use yolo mode by default</div>
            <div className="text-ui-sm text-zinc-500 mt-0.5">
              Passes --dangerously-skip-permissions so Claude always skips permission prompts
            </div>
          </div>
          <Switch
            checked={claudeCode.yoloModeByDefault}
            disabled={!claudeCode.allowYoloMode}
            onCheckedChange={(v) => claudeCode.update({ yoloModeByDefault: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-ui-base font-medium text-zinc-200">Auto-pilot scan interval</div>
            <div className="text-ui-sm text-zinc-500 mt-0.5">
              How often PTY output is scanned (ms)
            </div>
          </div>
          <input
            type="number"
            min={50}
            max={5000}
            step={50}
            value={claudeCode.autoPilotScanMs}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              if (!isNaN(v) && v >= 50) claudeCode.update({ autoPilotScanMs: v })
            }}
            className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-ui-base text-zinc-200 text-right focus:outline-none focus:border-zinc-500"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-ui-base font-medium text-zinc-200">Disable background tasks</div>
            <div className="text-ui-sm text-zinc-500 mt-0.5">
              Default for new Claude Code tabs
            </div>
          </div>
          <Switch
            checked={claudeCode.disableBackgroundTasks}
            onCheckedChange={(v) => claudeCode.update({ disableBackgroundTasks: v })}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-ui-base font-medium text-zinc-200">Agent teams</div>
            <div className="text-ui-sm text-zinc-500 mt-0.5">
              Sets CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
            </div>
          </div>
          <Switch
            checked={claudeCode.agentTeams}
            onCheckedChange={(v) => claudeCode.update({ agentTeams: v })}
          />
        </div>
      </div>

      <div className="w-full h-px bg-zinc-800" />

      <div className="flex flex-col gap-4">
        <div className="text-ui-sm text-zinc-500 uppercase tracking-wider">Codex</div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-ui-base font-medium text-zinc-200">Auto-pilot scan interval</div>
            <div className="text-ui-sm text-zinc-500 mt-0.5">
              How often PTY output is scanned (ms)
            </div>
          </div>
          <input
            type="number"
            min={50}
            max={5000}
            step={50}
            value={codex.autoPilotScanMs}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              if (!isNaN(v) && v >= 50) codex.update({ autoPilotScanMs: v })
            }}
            className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-ui-base text-zinc-200 text-right focus:outline-none focus:border-zinc-500"
          />
        </div>
      </div>
    </div>
  )
}
