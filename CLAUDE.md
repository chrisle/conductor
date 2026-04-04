# Conductor App

## Type Checking

After editing any `.tsx` or `.ts` file, run `npm run typecheck` from the `app/` directory and fix any errors in the files you touched before considering the task done. Vite does not type-check — it only strips types — so `tsc` is the only guard against prop mismatches, missing imports, and type errors.

## Context Menu Rules

All right-click context menus MUST follow the established patterns used throughout the app. Do NOT deviate from these rules.

### Imports

- Always import from `@/components/ui/context-menu` — never directly from `@radix-ui/react-context-menu`
- Never use native Electron menus (`Menu.buildFromTemplate`, `Menu.popup`) for right-click context menus
- Never use raw `onContextMenu` event handlers — always use the `<ContextMenu>` + `<ContextMenuTrigger>` component pattern

### Structure

Every context menu follows this exact component structure:

```tsx
<ContextMenu>
  <ContextMenuTrigger>  {/* or <ContextMenuTrigger asChild> */}
    {/* The element that receives the right-click */}
  </ContextMenuTrigger>
  <ContextMenuContent className="w-44 bg-zinc-900 border-zinc-700">
    {/* Menu items here */}
  </ContextMenuContent>
</ContextMenu>
```

### ContextMenuContent styling

- Always include: `className="w-44 bg-zinc-900 border-zinc-700"`
- Use `min-w-[140px]` instead of `w-44` only when the menu has very short labels (e.g. file tree)

### ContextMenuItem styling

- Normal items: `className="gap-2 text-xs cursor-pointer"`
- Destructive items (delete, kill, etc.): `className="gap-2 text-xs cursor-pointer text-red-400 focus:text-red-300"`
- When an item uses `onClick`/`onSelect` with an explicit styling override per-item (like FileTreeNode), use: `className="text-xs text-zinc-300 focus:bg-zinc-800 focus:text-zinc-100"`

### Icons

- Every menu item MUST have a `lucide-react` icon
- Icon size: `className="w-3.5 h-3.5"` — always `w-3.5 h-3.5`, nothing else
- Icons are placed as a direct child before the label text, using `gap-2` on the parent `ContextMenuItem` to space them
- Do NOT add `mr-2` to icons when the parent item already has `gap-2`
- Only use `mr-2` on icons when the parent item does NOT have `gap-2` (e.g. GitGraphTab pattern where items lack the `gap-2` class)

### Separators

- Use `<ContextMenuSeparator className="bg-zinc-700" />` between logical groups of actions
- Always separate destructive actions from normal actions with a separator
- The separator classname `bg-zinc-700` is required

### Submenus

When nesting submenus, follow this pattern:

```tsx
<ContextMenuSub>
  <ContextMenuSubTrigger className="gap-2 text-xs cursor-pointer">
    Label
  </ContextMenuSubTrigger>
  <ContextMenuSubContent className="bg-zinc-900 border-zinc-700">
    {/* Sub-items */}
  </ContextMenuSubContent>
</ContextMenuSub>
```

### Ordering convention

1. Primary action (Open, Rename, etc.)
2. Secondary actions (Refresh, Move, etc.)
3. Separator
4. Destructive actions last (Delete, Kill) — always in `text-red-400 focus:text-red-300`

### For links/URLs

Use the `<LinkContextMenu>` component from `@/components/ui/link-context-menu` instead of building a custom context menu. It provides "Open in Conductor" and "Open in System Browser" actions.

## Session Info Panel Extension

Extensions can add custom rows to the expanded session info panel in the Sessions sidebar. Use the session info registry:

```tsx
import { useSessionInfoRegistry } from '@/extensions/work-sessions'
import type { SessionInfoContext } from '@/extensions/work-sessions'

// Register on mount (e.g. in a useEffect or at module level)
useSessionInfoRegistry.getState().register({
  id: 'my-extension-info',   // unique id — re-registering replaces previous
  order: 110,                // sort order (built-in rows use 0–50, default 100)
  render: (ctx: SessionInfoContext) => {
    // Return a ReactNode or null to skip
    if (!ctx.workSession) return null
    return (
      <div className="flex items-center gap-1.5">
        <MyIcon className="w-3 h-3 text-zinc-500 shrink-0" />
        <span className="text-zinc-300">Custom info</span>
      </div>
    )
  },
})

// Unregister when done
useSessionInfoRegistry.getState().unregister('my-extension-info')
```

`SessionInfoContext` provides: `sessionName`, `cwd`, `command`, `connected`, `hasOpenTab`, `isThinking`, `workSession`.

## E2E Testing

When writing e2e tests that need to interact with the terminal or any feature requiring Electron IPC (e.g. conductord communication), connect Playwright to Electron's CDP (Chrome DevTools Protocol) port. The Vite dev server at `localhost:5173` is just the renderer — it does NOT have access to `window.electronAPI` or IPC.

### How to launch

Start the Electron app with a remote debugging port:

```sh
npx electron-vite dev -- --remote-debugging-port=9222
```

### How to connect Playwright

```ts
import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://localhost:9222')
const context = browser.contexts()[0]
const page = context.pages()[0]
// `page` is the actual Electron renderer with full IPC access
```

### Process cleanup

Always kill stale processes before starting or iterating on tests. Leftover Electron and conductord processes get stuck and cause flaky failures or port conflicts.

```sh
pkill -f conductord 2>/dev/null
pkill -f "Electron" 2>/dev/null
pkill -f "electron-vite" 2>/dev/null
sleep 2
```

Run this cleanup at the start of every test run and between iterations.

### What NOT to do

- Do not use `page.goto('http://localhost:5173')` — that opens a plain browser tab without Electron IPC
- Do not simulate conductord WebSocket connections with Node.js scripts — test through the real Electron app
- Do not use AppleScript/screen coordinates to click UI elements — use Playwright selectors via CDP
