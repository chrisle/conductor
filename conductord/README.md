# conductord

A Go daemon that manages long-lived terminal sessions over PTY. Sessions survive app restarts via an in-memory scrollback buffer. Provides a WebSocket API for real-time I/O and includes an autopilot system that auto-responds to CLI permission prompts.

## Architecture

```
Electron App (renderer)
    │
    │  IPC
    ▼
Electron Main Process
    │
    │  HTTP over Unix socket
    ▼
conductord ──────── PTY ──────── shell / claude / codex
    │
    ├── System tray (macOS)
    └── Log file (~/.conductor/logs)
```

conductord listens on a Unix domain socket (`~/.conductor/conductord.sock`). The Electron main process bridges IPC calls from the renderer to HTTP/WebSocket requests on this socket.

## Building

Prerequisites: Go 1.25+

```bash
cd conductord && go build -o conductord .
```

Or from the app root:

```bash
npm run package   # go build + electron-vite build + electron-builder
```

## Running

```bash
# With system tray (default when launched by Electron)
./conductord -tray

# Headless daemon
./conductord

# Custom socket path + dev TCP port
./conductord -socket /tmp/my.sock -dev-port 8080
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `-socket` | `~/.conductor/conductord.sock` | Unix socket path |
| `-dev-port` | `0` (disabled) | TCP port for web dev mode |
| `-tray` | `false` | Show macOS system tray icon |

### Environment

| Variable | Effect |
|----------|--------|
| `SHELL` | Login shell used for sessions and exec (fallback: `/bin/zsh`) |
| `CONDUCTOR_SKIP_TRAY` | Set by Electron to disable tray spawning |

## API

### WebSocket: Terminal Sessions

```
GET /ws/terminal?id=<session-id>&cwd=<path>&command=<cmd>
```

Upgrades to a WebSocket connection. Creates a new PTY session or reattaches to an existing one.

**Server → Client:**
- Binary frames: PTY output
- JSON: `{type: "session", data: "<id>", isNew: bool, autoPilot: bool}` on connect

**Client → Server (JSON):**

| Type | Data | Effect |
|------|------|--------|
| `input` | string | Write to PTY |
| `resize` | `{cols, rows}` | Resize PTY |
| `kill` | — | Terminate session |
| `autopilot` | boolean | Enable/disable prompt auto-response |
| `capture-scrollback` | — | Request scrollback buffer (returns JSON `{type: "scrollback", data: "..."}`) |

On connect, the server replays the 64 KB scrollback buffer so the client sees recent output.

### REST Endpoints

**`GET /health`**
```json
{"status": "ok", "fullDiskAccess": true}
```

**`GET /api/sessions`** — List active PTY sessions
```json
[{"id": "my-session", "dead": false}]
```

**`DELETE /api/sessions/{id}`** — Kill a session

**`POST /api/exec`** — One-shot command execution (no PTY)
```json
// Request
{"command": "npm", "args": ["install"], "cwd": "/project", "timeout": 60}

// Response
{"success": true, "stdout": "...", "stderr": "...", "exitCode": 0}
```

Commands run through the user's login shell (`bash -ilc` / `zsh -ilc`) so PATH and aliases are available.

## Session Lifecycle

```
1. Client connects via WebSocket with session ID
2. If new: PTY created → readLoop() starts
   If existing: scrollback replayed → live output resumes
3. Client disconnects → session stays alive (PTY keeps running)
4. Client reconnects → reattaches, scrollback replayed
5. Client sends "kill" → PTY terminated, session destroyed
```

Sessions survive client disconnects, app restarts, and window closes. Only an explicit kill or `Quit Conductor` from the tray destroys them.

## Autopilot

The autopilot system monitors PTY output and auto-responds to CLI permission prompts (e.g., Claude Code's tool-use confirmations). It uses a two-tier detection system:

### Menu-Style Prompts (Enter)

Requires all three signals present in the last 25 terminal lines:

1. **Yes option** — `1. Yes`, `❯ Yes`, `> Yes`, `Yes Allow once`
2. **No option** — `2. No`, `Deny`, `Decline`, `No, exit`
3. **Context keyword** — `Bash`, `Read`, `Write`, `Edit`, `execute`, `permission`, `trust this folder`, etc.

Sends: `\r` (Enter to accept the default/highlighted option)

### Text-Style Prompts (y + Enter)

Matches specific patterns like `(Y/n)`, `[y/n]`, `confirm? (y/n)`, `continue? [y/n]`, `press enter to continue`.

Sends: `y\r` (or `\r` for press-enter prompts)

### API Error 500 Backoff

When `API Error: 500` appears, autopilot sends `continue\r` with exponential backoff (1s → 2s → 4s → ... → 2min cap).

### Safety

- Only scans the last 25 lines of terminal output
- 250ms throttle between responses
- 150ms delay before sending (lets the terminal settle)
- Vetoes responses when a slash-command autocomplete picker is open
- Disabled by default — toggled per-session via WebSocket

## System Tray

When run with `-tray`, conductord shows a macOS system tray icon with:

- **Conductor** — app title
- **N active sessions** — updates every 2 seconds
- **Open Conductor** — launches the Electron app
- **View Logs** — opens `~/Library/Logs/conductord.log`
- **Quit Conductor** — kills all sessions and exits

The tray icon is a programmatically generated 22×22 template PNG showing a `>_` terminal prompt.

## Logging

All log output is written to both stderr and `~/Library/Logs/conductord.log`. The Electron app's log viewer reads this file via a file watcher.

## Testing

```bash
cd conductord && go test ./...
```

Tests cover the `/api/exec` endpoint: argument handling, working directory, timeouts, special characters, and error cases.

## Dependencies

| Module | Version | Purpose |
|--------|---------|---------|
| `fyne.io/systray` | v1.12.0 | System tray (macOS/Linux/Windows) |
| `github.com/creack/pty` | v1.1.24 | Pseudo-terminal creation |
| `github.com/gorilla/websocket` | v1.5.3 | WebSocket protocol |

## Files

```
conductord/
├── main.go          Core daemon: sessions, API handlers, autopilot, exec
├── tray.go          System tray menu and lifecycle
├── tray_icon.go     Programmatic tray icon generation
├── exec_test.go     Tests for /api/exec endpoint
├── go.mod
├── go.sum
└── embedded/
    ├── .gitkeep
    └── AppIcon.icns         macOS app icon
```
