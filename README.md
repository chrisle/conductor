# Conductor

A terminal workspace for developers who use AI coding assistants.

Conductor gives Claude Code and your shell a persistent, multi-pane home so you can run several AI sessions side-by-side, keep them alive across app restarts, and see your files, git history, and browser in the same window.

## Why Conductor

**Sessions that survive app restarts.** Every terminal is backed by tmux. Close the window and reopen it — pick up exactly where you left off with full scrollback.

**Run AI assistants in parallel.** Split the workspace into as many panes as you need. Have Claude Code refactoring in one pane, another Claude session generating tests, and a shell running your build — all visible at once.

**Autopilot for permission prompts.** AI coding tools constantly ask "Allow this?" Conductor's autopilot detects those prompts and approves them automatically so long-running agents don't stall waiting for input.

**Everything in one place.** Browse files, preview images and spreadsheets, view your git graph, and open a web browser without leaving the app. Each lives in a tab you can drag, split, or pin.

**Multiple Claude accounts.** Switch between API keys in one click — personal, work, client project — without touching environment variables.

## Features

- **Persistent terminals** — tmux-backed sessions with 64KB scrollback replay on reconnect
- **Split panes and tabs** — horizontal/vertical splits with drag-and-drop tab rearrangement
- **Claude Code** — first-class support with session history and multiple account switching
- **Autopilot** — auto-responds to CLI permission prompts and retries on API errors with exponential backoff
- **File explorer** — browse project files, preview Markdown, images, spreadsheets, and Word docs
- **Code editor** — Monaco-based editor with syntax highlighting
- **Git graph** — visual commit history with branch lanes, diffs, and ref labels
- **Embedded browser** — full Chromium webview with a bridge to Claude Code
- **Project files** — save and restore your entire workspace layout (tabs, splits, sessions)
- **System tray** — macOS tray icon showing active session count with quick access
- **Extension system** — registry-based architecture for adding sidebar panels, tab types, and menu items

## Architecture

```text
Electron App (renderer)
    |
    |  IPC
    v
Electron Main Process
    |
    |  HTTP over Unix socket
    v
conductord (Go daemon) --- PTY --- tmux session --- shell / claude
```

The Electron frontend handles UI. A Go daemon (`conductord`) manages terminal sessions over PTY, communicating via HTTP and WebSocket on a Unix domain socket. This separation means sessions stay alive even when the app isn't running.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, xterm.js, Monaco Editor, Radix UI, Tailwind CSS, Zustand
- **Desktop:** Electron
- **Daemon:** Go, gorilla/websocket, creack/pty
- **Sessions:** tmux (bundled binary, isolated socket)

## Getting Started

```bash
npm install
npm run dev
```

The dev server starts the Electron app and spawns `conductord` automatically. Sessions persist in `~/.conductor/`.
