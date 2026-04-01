package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"

	"embed"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

// Embedded tmux bundle. The directory is populated by scripts/prepare-tmux.sh
// before building. If the directory is absent the embed is a no-op and we fall
// back to the system tmux.
//
//go:embed embedded
var embeddedFS embed.FS

// ---------------------------------------------------------------------------
// Session — a PTY that outlives any single WebSocket connection
// ---------------------------------------------------------------------------

const scrollbackSize = 64 * 1024 // 64 KB ring buffer for replay on reconnect

type session struct {
	id   string
	mu   sync.Mutex
	ptmx *os.File
	cmd  *exec.Cmd
	dead bool // true once the PTY process has exited

	// Scrollback ring buffer: stores recent PTY output so reconnecting
	// clients can see what happened while disconnected.
	scrollback []byte
	sbPos      int  // write cursor in ring buffer
	sbFull     bool // true once we've wrapped around

	// Currently attached WebSocket (nil if detached)
	conn *websocket.Conn

	// Autopilot: auto-respond to yes/no prompts even when no tab is open.
	autoPilot  bool
	apBuf      []byte // recent PTY output for prompt scanning (max 4 KB)
	apLastMs   int64  // unix ms of last auto-response (throttle)
}

// ---------------------------------------------------------------------------
// Autopilot helpers
// ---------------------------------------------------------------------------

var ansiEscape = regexp.MustCompile(`\x1b(\[[0-9;]*[A-Za-z]|\][^\x07]*\x07|[()][0-9A-Za-z]|\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e])`)

func stripAnsi(s string) string {
	return ansiEscape.ReplaceAllString(s, "")
}

var (
	// Legacy numbered menu: "1. Yes"
	apReYes1       = regexp.MustCompile(`(?s)1\.?\s*Yes`)
	// Claude Code v2+ cursor menu: "❯ Yes" or "> Yes"
	apReCursorYes  = regexp.MustCompile(`[❯>]\s+Yes\b`)
	// Claude Code permission menu: "Yes  Allow once" or "Yes, and don't ask"
	apReYesAllow   = regexp.MustCompile(`(?i)Yes\s+(Allow once|and don't ask)`)
	// Generic yes/no prompts
	apReYN1        = regexp.MustCompile(`(?im)\(Y/n\)\s*$`)
	apReYN2        = regexp.MustCompile(`(?im)\(y/N\)\s*$`)
	apReYN3        = regexp.MustCompile(`(?im)\[y/n\]\s*$`)
	apReYN4        = regexp.MustCompile(`(?im)\[Y/n\]\s*$`)
	apReConfirm    = regexp.MustCompile(`(?i)confirm\? \(y/n\)`)
	apRePressEnter = regexp.MustCompile(`(?i)press enter to continue`)
	apReContinue   = regexp.MustCompile(`(?i)continue\? \[y/n\]`)
	apReAllow      = regexp.MustCompile(`(?i)Allow.*\(y/n\)`)
	// "Do you want to proceed?" style
	apReProceed    = regexp.MustCompile(`(?i)proceed\?\s*\(y/n\)`)
)

func matchPrompt(text string) string {
	if apReYes1.MatchString(text)       { return "\r" }
	if apReCursorYes.MatchString(text)  { return "\r" }
	if apReYesAllow.MatchString(text)   { return "\r" }
	if apReYN1.MatchString(text)        { return "y\r" }
	if apReYN2.MatchString(text)        { return "y\r" }
	if apReYN3.MatchString(text)        { return "y\r" }
	if apReYN4.MatchString(text)        { return "y\r" }
	if apReConfirm.MatchString(text)    { return "y\r" }
	if apRePressEnter.MatchString(text) { return "\r" }
	if apReContinue.MatchString(text)   { return "y\r" }
	if apReAllow.MatchString(text)      { return "y\r" }
	if apReProceed.MatchString(text)    { return "y\r" }
	return ""
}

var (
	sessions   = make(map[string]*session)
	sessionsMu sync.Mutex
)

// tmuxPath is the resolved path to the tmux binary (bundled or system).
var tmuxPath string

// tmuxConf is the path to the extracted tmux.conf, or "" to use defaults.
var tmuxConf string

// initTmux extracts the embedded tmux bundle (if present) and sets tmuxPath.
// Falls back to the system tmux when no embedded bundle is available.
func initTmux() {
	bundleDir := fmt.Sprintf("embedded/%s-%s", runtime.GOOS, runtime.GOARCH)

	entries, err := fs.ReadDir(embeddedFS, bundleDir)
	if err != nil || len(entries) == 0 {
		// No embedded bundle — try system PATH
		tmuxPath, _ = exec.LookPath("tmux")
		if tmuxPath != "" {
			log.Printf("[tmux] using system tmux: %s", tmuxPath)
		} else {
			log.Printf("[tmux] not found; terminal sessions will use a plain shell")
		}
		return
	}

	// Extract bundle to a per-user cache directory so it survives reboots but
	// is refreshed when the binary changes.
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		cacheDir = os.TempDir()
	}
	extractDir := filepath.Join(cacheDir, "conductor", "tmux")
	if err := os.MkdirAll(extractDir, 0755); err != nil {
		log.Printf("[tmux] failed to create extract dir %s: %v", extractDir, err)
		tmuxPath, _ = exec.LookPath("tmux")
		return
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		src := bundleDir + "/" + entry.Name()
		data, err := embeddedFS.ReadFile(src)
		if err != nil {
			log.Printf("[tmux] embed read error %s: %v", src, err)
			continue
		}
		dest := filepath.Join(extractDir, entry.Name())
		// Only write if content changed (avoid touching mtime unnecessarily)
		if existing, err := os.ReadFile(dest); err != nil || !bytes.Equal(existing, data) {
			if err := os.WriteFile(dest, data, 0755); err != nil {
				log.Printf("[tmux] write error %s: %v", dest, err)
				continue
			}
		}
		// Ensure executable bit is set
		os.Chmod(dest, 0755)
	}

	// Also extract the shared tmux.conf (lives in embedded/, not the arch subdir)
	if confData, err := embeddedFS.ReadFile("embedded/tmux.conf"); err == nil {
		confDest := filepath.Join(extractDir, "tmux.conf")
		if existing, err := os.ReadFile(confDest); err != nil || !bytes.Equal(existing, confData) {
			os.WriteFile(confDest, confData, 0644)
		}
		tmuxConf = confDest
	}

	candidate := filepath.Join(extractDir, "tmux")
	if _, err := os.Stat(candidate); err == nil {
		tmuxPath = candidate
		log.Printf("[tmux] using bundled tmux: %s (conf: %s)", tmuxPath, tmuxConf)
	} else {
		tmuxPath, _ = exec.LookPath("tmux")
		log.Printf("[tmux] bundle extract failed, falling back to system: %s", tmuxPath)
	}
}

// tmuxCmd builds a tmux exec.Cmd, prepending "-u" (force UTF-8) and
// "-f <conf>" when a config file has been extracted, so every invocation
// uses the same settings.
func tmuxCmd(args ...string) *exec.Cmd {
	// -u: force UTF-8 output regardless of locale. Critical because conductord
	// runs as a launchd service with a bare environment (no LANG/LC_ALL), and
	// without -u tmux disables UTF-8 — mangling box-drawing and block chars.
	prefix := []string{"-u"}
	if tmuxConf != "" {
		prefix = append(prefix, "-f", tmuxConf)
	}
	return exec.Command(tmuxPath, append(prefix, args...)...)
}

// tmuxEnv returns the environment for tmux processes. It starts from the
// current process environment and ensures the essential variables are set,
// filling in sensible defaults for the ones launchd strips out (LANG, etc.).
func tmuxEnv() []string {
	env := os.Environ()
	// Ensure UTF-8 locale — launchd services start with a bare environment
	// that has no LANG/LC_ALL, which makes tmux disable UTF-8 output even
	// when -u is passed. Inject only if not already present.
	hasLang := false
	for _, e := range env {
		if strings.HasPrefix(e, "LANG=") || strings.HasPrefix(e, "LC_ALL=") {
			hasLang = true
			break
		}
	}
	if !hasLang {
		env = append(env, "LANG=en_US.UTF-8", "LC_ALL=en_US.UTF-8")
	}
	// Always override TERM/COLORTERM so they're correct regardless of what
	// the parent environment has.
	env = append(env, "TERM=xterm-256color", "COLORTERM=truecolor")
	return env
}

// sanitizeTmuxName converts an ID to a valid tmux session name.
func sanitizeTmuxName(id string) string {
	var b strings.Builder
	for _, c := range id {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') || c == '-' || c == '_' {
			b.WriteRune(c)
		} else {
			b.WriteRune('_')
		}
	}
	if b.Len() == 0 {
		return "default"
	}
	return b.String()
}

// tmuxSessionExists returns true if a tmux session with exactly this name exists.
func tmuxSessionExists(name string) bool {
	cmd := tmuxCmd("has-session", "-t", "="+name)
	return cmd.Run() == nil
}

// newSession creates a new conductord session. Returns the session, whether it
// is a brand-new tmux session (isNew=true) or an attach to an existing one
// (isNew=false), and any error.
func newSession(id, cwd string) (*session, bool, error) {
	var cmd *exec.Cmd
	isNew := true

	if tmuxPath != "" {
		tmuxName := sanitizeTmuxName(id)
		isNew = !tmuxSessionExists(tmuxName)

		if isNew {
			// Create a new detached tmux session so the shell is started in the
			// right directory. We then attach to it via a PTY below.
			createCmd := tmuxCmd("new-session", "-d", "-s", tmuxName, "-c", cwd)
			createCmd.Env = tmuxEnv()
			if err := createCmd.Run(); err != nil {
				return nil, false, fmt.Errorf("tmux new-session: %w", err)
			}
			// Enable mouse mode so scroll events are handled as scrollback
			// instead of being translated to arrow key sequences.
			mouseCmd := tmuxCmd("set-option", "-t", "="+tmuxName, "mouse", "on")
			mouseCmd.Env = tmuxEnv()
			_ = mouseCmd.Run()
			log.Printf("[session %s] created tmux session '%s'", id, tmuxName)
		} else {
			log.Printf("[session %s] attaching to existing tmux session '%s'", id, tmuxName)
		}

		cmd = tmuxCmd("attach-session", "-t", "="+tmuxName)
		cmd.Env = tmuxEnv()
	} else {
		// tmux not available — fall back to a plain login shell
		shell := getShell()
		cmd = exec.Command(shell, "-l")
		cmd.Dir = cwd
		cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	}

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, false, err
	}

	s := &session{
		id:         id,
		ptmx:       ptmx,
		cmd:        cmd,
		scrollback: make([]byte, scrollbackSize),
	}

	go s.readLoop()

	go func() {
		err := s.cmd.Wait()
		// When tmux attach-session exits the underlying tmux session may still
		// be alive (just detached). Remove from the in-memory map so the next
		// WebSocket connection creates a fresh attach process.
		s.mu.Lock()
		s.dead = true
		conn := s.conn
		s.mu.Unlock()
		if conn != nil {
			conn.Close()
		}
		if err != nil {
			log.Printf("[session %s] attach process exited with error: %v", id, err)
		} else {
			log.Printf("[session %s] attach process exited (status 0)", id)
		}

		sessionsMu.Lock()
		delete(sessions, id)
		sessionsMu.Unlock()
	}()

	return s, isNew, nil
}

func (s *session) readLoop() {
	buf := make([]byte, 4096)
	for {
		n, err := s.ptmx.Read(buf)
		if n > 0 {
			data := buf[:n]

			s.mu.Lock()
			// Append to scrollback ring buffer
			for i := 0; i < n; i++ {
				s.scrollback[s.sbPos] = data[i]
				s.sbPos = (s.sbPos + 1) % scrollbackSize
				if s.sbPos == 0 {
					s.sbFull = true
				}
			}
			conn := s.conn

			// Autopilot: accumulate output and scan for prompts
			var apResponse string
			if s.autoPilot {
				s.apBuf = append(s.apBuf, data...)
				if len(s.apBuf) > 4096 {
					s.apBuf = s.apBuf[len(s.apBuf)-4096:]
				}
				now := time.Now().UnixMilli()
				if now-s.apLastMs >= 250 {
					stripped := stripAnsi(string(s.apBuf))
					// Log the tail of the scanned buffer for debugging
					tail := stripped
					if len(tail) > 300 {
						tail = tail[len(tail)-300:]
					}
					log.Printf("[autopilot %s] scanning %d bytes, tail: %q", s.id, len(stripped), tail)
					apResponse = matchPrompt(stripped)
					if apResponse != "" {
						s.apLastMs = now
						s.apBuf = nil
					}
				}
			}
			s.mu.Unlock()

			// Forward to attached client
			if conn != nil {
				if werr := conn.WriteMessage(websocket.BinaryMessage, data); werr != nil {
					s.mu.Lock()
					s.conn = nil
					s.mu.Unlock()
				}
			}

			// Send autopilot response after a short delay (mimics human think time)
			if apResponse != "" {
				resp := apResponse
				go func() {
					time.Sleep(150 * time.Millisecond)
					s.write([]byte(resp))
				}()
			}
		}
		if err != nil {
			if err != io.EOF {
				log.Printf("[session %s] pty read error: %v", s.id, err)
			}
			return
		}
	}
}

// getScrollback returns the buffered scrollback content.
func (s *session) getScrollback() []byte {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.sbFull {
		return append([]byte(nil), s.scrollback[:s.sbPos]...)
	}
	// Ring buffer has wrapped: read from sbPos..end, then 0..sbPos
	out := make([]byte, scrollbackSize)
	copy(out, s.scrollback[s.sbPos:])
	copy(out[scrollbackSize-s.sbPos:], s.scrollback[:s.sbPos])
	return out
}

func (s *session) attach(conn *websocket.Conn) {
	s.mu.Lock()
	old := s.conn
	s.conn = conn
	s.mu.Unlock()

	if old != nil {
		old.Close()
	}
}

func (s *session) detach(conn *websocket.Conn) {
	s.mu.Lock()
	if s.conn == conn {
		s.conn = nil
	}
	s.mu.Unlock()
}

func (s *session) write(data []byte) {
	s.ptmx.Write(data)
}

func (s *session) resize(cols, rows uint16) {
	pty.Setsize(s.ptmx, &pty.Winsize{Cols: cols, Rows: rows})
}

func (s *session) kill() {
	// Kill the tmux session itself so it doesn't keep running in the background.
	if tmuxPath != "" {
		tmuxCmd("kill-session", "-t", "="+sanitizeTmuxName(s.id)).Run()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.dead {
		s.cmd.Process.Kill()
	}
}

// ---------------------------------------------------------------------------
// WebSocket handler
// ---------------------------------------------------------------------------

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type clientMsg struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data,omitempty"`
}

type resizeMsg struct {
	Cols int `json:"cols"`
	Rows int `json:"rows"`
}

func getShell() string {
	if runtime.GOOS == "windows" {
		return "powershell.exe"
	}
	if s := os.Getenv("SHELL"); s != "" {
		return s
	}
	return "/bin/zsh"
}

func handleTerminal(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade error: %v", err)
		return
	}

	id := r.URL.Query().Get("id")
	cwd := r.URL.Query().Get("cwd")
	if cwd == "" {
		home, _ := os.UserHomeDir()
		cwd = home
	}

	sessionsMu.Lock()
	s, exists := sessions[id]
	// If the session exists but its PTY process is dead, discard it and
	// create a fresh attach. This avoids reattaching a stale session whose
	// underlying tmux attach-session has already exited.
	if exists {
		s.mu.Lock()
		dead := s.dead
		s.mu.Unlock()
		if dead {
			delete(sessions, id)
			exists = false
			log.Printf("[session %s] discarded dead session, will recreate", id)
		}
	}
	isNew := false
	if !exists && id != "" {
		s, isNew, err = newSession(id, cwd)
		if err != nil {
			sessionsMu.Unlock()
			log.Printf("session create error: %v", err)
			conn.WriteJSON(map[string]string{"type": "error", "data": err.Error()})
			conn.Close()
			return
		}
		sessions[id] = s
	} else if !exists {
		id = fmt.Sprintf("s-%d", time.Now().UnixNano())
		s, isNew, err = newSession(id, cwd)
		if err != nil {
			sessionsMu.Unlock()
			log.Printf("session create error: %v", err)
			conn.WriteJSON(map[string]string{"type": "error", "data": err.Error()})
			conn.Close()
			return
		}
		sessions[id] = s
	} else {
		log.Printf("[session %s] reattached (existing conductord session)", id)
	}
	sessionsMu.Unlock()

	// Send session ID + isNew flag to client.
	// isNew=true means a brand-new tmux session was created → client should
	// send its initialCommand. isNew=false means we attached to an existing
	// tmux session → client should NOT send initialCommand (process is running).
	conn.WriteJSON(map[string]interface{}{"type": "session", "data": s.id, "isNew": isNew})

	// Replay scrollback so the client sees previous output
	scrollback := s.getScrollback()
	if len(scrollback) > 0 {
		conn.WriteMessage(websocket.BinaryMessage, scrollback)
	}

	// Attach this connection
	s.attach(conn)
	defer s.detach(conn)

	// WebSocket -> PTY
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var msg clientMsg
		if err := json.Unmarshal(raw, &msg); err != nil {
			s.write(raw)
			continue
		}

		switch msg.Type {
		case "input":
			var str string
			json.Unmarshal(msg.Data, &str)
			s.write([]byte(str))
		case "resize":
			var sz resizeMsg
			json.Unmarshal(msg.Data, &sz)
			if sz.Cols > 0 && sz.Rows > 0 {
				s.resize(uint16(sz.Cols), uint16(sz.Rows))
			}
		case "kill":
			s.kill()
		case "autopilot":
			var enabled bool
			json.Unmarshal(msg.Data, &enabled)
			s.mu.Lock()
			s.autoPilot = enabled
			if !enabled {
				s.apBuf = nil
			}
			s.mu.Unlock()
			log.Printf("[session %s] autopilot %v", s.id, enabled)
		case "tmux-option":
			// Set a tmux option on this session's tmux window.
			// Data: { "key": "mouse", "value": "on" | "off" }
			if tmuxPath == "" {
				break
			}
			var opt struct {
				Key   string `json:"key"`
				Value string `json:"value"`
			}
			json.Unmarshal(msg.Data, &opt)
			// Whitelist allowed options to prevent arbitrary tmux commands.
			allowed := map[string]bool{"mouse": true}
			if !allowed[opt.Key] {
				log.Printf("[session %s] tmux-option: rejected key %q", s.id, opt.Key)
				break
			}
			tmuxName := sanitizeTmuxName(s.id)
			setCmd := tmuxCmd("set-option", "-t", "="+tmuxName, opt.Key, opt.Value)
			setCmd.Env = tmuxEnv()
			if err := setCmd.Run(); err != nil {
				log.Printf("[session %s] tmux-option %s=%s failed: %v", s.id, opt.Key, opt.Value, err)
			} else {
				log.Printf("[session %s] tmux-option %s=%s", s.id, opt.Key, opt.Value)
			}
		}
	}
}

// ---------------------------------------------------------------------------
// REST endpoints
// ---------------------------------------------------------------------------

type sessionInfo struct {
	ID   string `json:"id"`
	Dead bool   `json:"dead"`
}

func handleSessions(w http.ResponseWriter, r *http.Request) {
	// DELETE /api/sessions/{id} — kill a session
	if r.Method == http.MethodDelete {
		// Path is /api/sessions/{id}
		id := strings.TrimPrefix(r.URL.Path, "/api/sessions/")
		if id == "" {
			http.Error(w, "session id required", http.StatusBadRequest)
			return
		}
		sessionsMu.Lock()
		s, ok := sessions[id]
		if ok {
			delete(sessions, id)
		}
		sessionsMu.Unlock()
		if ok {
			s.kill()
			log.Printf("[session %s] killed via API", id)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})
		return
	}

	sessionsMu.Lock()
	list := make([]sessionInfo, 0, len(sessions))
	for _, s := range sessions {
		s.mu.Lock()
		list = append(list, sessionInfo{ID: s.id, Dead: s.dead})
		s.mu.Unlock()
	}
	sessionsMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func hasFullDiskAccess() bool {
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	_, err = os.ReadDir(filepath.Join(home, "Library", "Safari"))
	return err == nil
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":         "ok",
		"fullDiskAccess": hasFullDiskAccess(),
	})
}

// handleTmuxSessions lists live tmux sessions with details, or kills one.
//
//	GET  /api/tmux               → [{name, connected, command, cwd, created, activity}, ...]
//	DELETE /api/tmux/{name}      → kills a single tmux session
//	DELETE /api/tmux?orphaned=1  → kills all tmux sessions with no active conductord connection
func handleTmuxSessions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodDelete {
		// Bulk-kill orphaned sessions
		if r.URL.Query().Get("orphaned") != "" {
			if tmuxPath == "" {
				json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "killed": 0})
				return
			}
			out, err := tmuxCmd("ls", "-F", "#{session_name}").Output()
			if err != nil {
				json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "killed": 0})
				return
			}
			killed := 0
			sessionsMu.Lock()
			connectedSet := make(map[string]bool, len(sessions))
			for id := range sessions {
				connectedSet[sanitizeTmuxName(id)] = true
			}
			sessionsMu.Unlock()
			for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
				if line != "" && !connectedSet[line] {
					tmuxCmd("kill-session", "-t", "="+line).Run()
					log.Printf("[tmux] killed orphaned session '%s' via API", line)
					killed++
				}
			}
			json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "killed": killed})
			return
		}

		// Single session kill
		name := strings.TrimPrefix(r.URL.Path, "/api/tmux/")
		if name == "" || tmuxPath == "" {
			json.NewEncoder(w).Encode(map[string]bool{"ok": false})
			return
		}
		tmuxCmd("kill-session", "-t", "="+name).Run()
		log.Printf("[tmux] killed session '%s' via API", name)
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})
		return
	}

	if tmuxPath == "" {
		json.NewEncoder(w).Encode([]interface{}{})
		return
	}

	// Get session list with timestamps
	out, err := tmuxCmd("ls", "-F", "#{session_name}\t#{session_created}\t#{session_activity}").Output()
	if err != nil {
		json.NewEncoder(w).Encode([]interface{}{})
		return
	}

	// Build a set of connected session names
	sessionsMu.Lock()
	connectedSet := make(map[string]bool, len(sessions))
	for id := range sessions {
		connectedSet[sanitizeTmuxName(id)] = true
	}
	sessionsMu.Unlock()

	type entry struct {
		Name      string `json:"name"`
		Connected bool   `json:"connected"`
		Command   string `json:"command"`
		Cwd       string `json:"cwd"`
		Created   int64  `json:"created"`
		Activity  int64  `json:"activity"`
	}

	var list []entry
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		name := parts[0]

		var created, activity int64
		if len(parts) >= 2 {
			fmt.Sscanf(parts[1], "%d", &created)
		}
		if len(parts) >= 3 {
			fmt.Sscanf(parts[2], "%d", &activity)
		}

		// Get pane info (command + cwd)
		var command, cwd string
		paneOut, paneErr := tmuxCmd("list-panes", "-t", "="+name, "-F", "#{pane_current_command}\t#{pane_current_path}").Output()
		if paneErr == nil {
			paneLine := strings.SplitN(strings.TrimSpace(string(paneOut)), "\n", 2)[0]
			paneParts := strings.SplitN(paneLine, "\t", 2)
			if len(paneParts) >= 1 {
				command = paneParts[0]
			}
			if len(paneParts) >= 2 {
				cwd = paneParts[1]
			}
		}

		list = append(list, entry{
			Name:      name,
			Connected: connectedSet[name],
			Command:   command,
			Cwd:       cwd,
			Created:   created,
			Activity:  activity,
		})
	}
	json.NewEncoder(w).Encode(list)
}

// ---------------------------------------------------------------------------
// One-shot command execution: POST /api/exec
// ---------------------------------------------------------------------------

type execRequest struct {
	Command string   `json:"command"`
	Args    []string `json:"args"`
	Cwd     string   `json:"cwd,omitempty"`
	Timeout int      `json:"timeout,omitempty"` // seconds, default 60
}

type execResponse struct {
	Success  bool   `json:"success"`
	Stdout   string `json:"stdout,omitempty"`
	Stderr   string `json:"stderr,omitempty"`
	ExitCode int    `json:"exitCode"`
	Error    string `json:"error,omitempty"`
}

// shellQuote wraps a string in single quotes, escaping any embedded single quotes.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'"
}

func handleExec(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}

	var req execRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(execResponse{Error: "invalid JSON: " + err.Error()})
		return
	}

	if req.Command == "" {
		log.Printf("[exec] rejected: empty command")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(execResponse{Error: "command is required"})
		return
	}

	timeout := req.Timeout
	if timeout <= 0 {
		timeout = 60
	}

	cwd := req.Cwd
	if cwd == "" {
		cwd, _ = os.UserHomeDir()
	}

	// Run through login shell so we get the user's full PATH, aliases, etc.
	shell := getShell()

	// Build a single shell command string with proper quoting
	parts := make([]string, 0, 1+len(req.Args))
	parts = append(parts, shellQuote(req.Command))
	for _, a := range req.Args {
		parts = append(parts, shellQuote(a))
	}
	shellCmd := strings.Join(parts, " ")

	log.Printf("[exec] starting: %s (cwd=%s, timeout=%ds)", req.Command, cwd, timeout)

	cmd := exec.Command(shell, "-ilc", shellCmd)
	cmd.Dir = cwd
	cmd.Env = os.Environ()

	start := time.Now()

	type result struct {
		stdout []byte
		stderr []byte
		err    error
	}

	resCh := make(chan result, 1)
	go func() {
		outPipe, _ := cmd.StdoutPipe()
		errPipe, _ := cmd.StderrPipe()

		if startErr := cmd.Start(); startErr != nil {
			resCh <- result{err: startErr}
			return
		}

		sout, _ := io.ReadAll(outPipe)
		serr, _ := io.ReadAll(errPipe)
		e := cmd.Wait()
		resCh <- result{stdout: sout, stderr: serr, err: e}
	}()

	select {
	case res := <-resCh:
		elapsed := time.Since(start)
		resp := execResponse{
			Stdout: string(res.stdout),
			Stderr: string(res.stderr),
		}
		if res.err != nil {
			resp.Error = res.err.Error()
			if exitErr, ok := res.err.(*exec.ExitError); ok {
				resp.ExitCode = exitErr.ExitCode()
			} else {
				resp.ExitCode = 1
			}
			log.Printf("[exec] failed: %s exit=%d err=%q (%.1fs)", req.Command, resp.ExitCode, resp.Error, elapsed.Seconds())
		} else {
			resp.Success = true
			log.Printf("[exec] success: %s stdout=%d bytes (%.1fs)", req.Command, len(resp.Stdout), elapsed.Seconds())
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)

	case <-time.After(time.Duration(timeout) * time.Second):
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
		log.Printf("[exec] timeout: %s after %ds", req.Command, timeout)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusGatewayTimeout)
		json.NewEncoder(w).Encode(execResponse{
			Error:    fmt.Sprintf("command timed out after %ds", timeout),
			ExitCode: -1,
		})
	}
}

// cors wraps a handler to allow cross-origin requests from the Electron renderer.
func cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

// defaultSocketPath returns the default Unix socket path (~/.conductor/conductord.sock).
func defaultSocketPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = os.TempDir()
	}
	return filepath.Join(home, ".conductor", "conductord.sock")
}

// healthCheckUnix connects to a Unix socket and sends an HTTP /health request.
// Returns true if the server responds with 200 OK.
func healthCheckUnix(sockPath string) bool {
	client := &http.Client{
		Transport: &http.Transport{
			DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
				return net.DialTimeout("unix", sockPath, 2*time.Second)
			},
		},
		Timeout: 3 * time.Second,
	}
	resp, err := client.Get("http://localhost/health")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func main() {
	socketPath := flag.String("socket", defaultSocketPath(), "Unix socket path")
	devPort := flag.Int("dev-port", 0, "optional TCP port for web dev mode (0 = disabled)")
	flag.Parse()

	// Extract bundled tmux (if available) and set tmuxPath.
	initTmux()

	// Ensure parent directory exists.
	if err := os.MkdirAll(filepath.Dir(*socketPath), 0755); err != nil {
		log.Fatalf("failed to create socket directory: %v", err)
	}

	// Check if another conductord instance is already running on this socket.
	if _, err := os.Stat(*socketPath); err == nil {
		if healthCheckUnix(*socketPath) {
			log.Printf("conductord already running on %s, exiting", *socketPath)
			os.Exit(0)
		}
		// Stale socket file — remove it.
		log.Printf("removing stale socket file %s", *socketPath)
		os.Remove(*socketPath)
	}

	http.HandleFunc("/ws/terminal", handleTerminal)
	http.HandleFunc("/api/sessions/", cors(handleSessions))
	http.HandleFunc("/api/sessions", cors(handleSessions))
	http.HandleFunc("/api/tmux/", cors(handleTmuxSessions))
	http.HandleFunc("/api/tmux", cors(handleTmuxSessions))
	http.HandleFunc("/api/exec", cors(handleExec))
	http.HandleFunc("/health", cors(handleHealth))

	ln, err := net.Listen("unix", *socketPath)
	if err != nil {
		log.Fatalf("listen error: %v", err)
	}
	os.Chmod(*socketPath, 0600)

	// Clean up socket file on shutdown.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-sigCh
		log.Printf("shutting down, removing socket %s", *socketPath)
		os.Remove(*socketPath)
		os.Exit(0)
	}()

	// Optional TCP listener for web dev mode.
	if *devPort > 0 {
		devAddr := fmt.Sprintf("127.0.0.1:%d", *devPort)
		devLn, err := net.Listen("tcp", devAddr)
		if err != nil {
			log.Printf("[dev] TCP listen on %s failed: %v (continuing with socket only)", devAddr, err)
		} else {
			log.Printf("[dev] also listening on %s", devAddr)
			go http.Serve(devLn, nil)
		}
	}

	log.Printf("conductord listening on %s", *socketPath)
	if err := http.Serve(ln, nil); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
