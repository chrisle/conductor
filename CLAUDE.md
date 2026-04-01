# Conductor App

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
