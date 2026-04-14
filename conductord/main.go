package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"

	gopty "github.com/aymanbagabas/go-pty"
	"github.com/charmbracelet/x/vt"
	"github.com/gorilla/websocket"
)

// ---------------------------------------------------------------------------
// Session — a PTY that outlives any single WebSocket connection
// ---------------------------------------------------------------------------

const scrollbackSize = 64 * 1024 // 64 KB ring buffer for replay on reconnect

type session struct {
	id      string
	cwd     string
	command string
	mu      sync.Mutex
	ptmx    gopty.Pty
	cmd     *gopty.Cmd
	dead    bool // true once the PTY process has exited

	// Scrollback ring buffer: stores recent PTY output so reconnecting
	// clients can see what happened while disconnected.
	scrollback []byte
	sbPos      int  // write cursor in ring buffer
	sbFull     bool // true once we've wrapped around

	// Virtual terminal emulator: interprets raw PTY output so reconnecting
	// clients receive the rendered screen state (with proper ANSI formatting)
	// instead of a raw byte replay that can produce garbled output.
	vterm *vt.Emulator
	vtMu  sync.RWMutex

	// Currently attached WebSocket (nil if detached)
	conn *websocket.Conn

	// Autopilot: auto-respond to yes/no prompts even when no tab is open.
	autoPilot  bool
	apBuf      []byte // recent PTY output for prompt scanning (max 4 KB)
	apLastMs   int64  // unix ms of last auto-response (throttle)

	// Exponential backoff for API Error 500 retries
	ap500Count int   // consecutive API Error 500 count
	ap500Until int64 // unix ms: suppress scanning until backoff expires
}

// ---------------------------------------------------------------------------
// Autopilot helpers
// ---------------------------------------------------------------------------

var ansiEscape = regexp.MustCompile(`\x1b(\[[0-9;]*[A-Za-z]|\][^\x07]*\x07|[()][0-9A-Za-z]|\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e])`)
var multiSpace = regexp.MustCompile(`[^\S\n]{2,}`)

func stripAnsi(s string) string {
	// Replace ANSI escape sequences with a space (not empty string) because
	// TUI apps use cursor-positioning escapes to lay out text — stripping them
	// to "" collapses words together (e.g. "3. No" + "Esc" → "3.NoEsc") which
	// breaks prompt detection regexes.  Then collapse runs of spaces.
	out := ansiEscape.ReplaceAllString(s, " ")
	return multiSpace.ReplaceAllString(out, " ")
}

// ---------------------------------------------------------------------------
// Two-tier prompt detection (inspired by claude-yolo / codex-yolo)
//
// Menu-style prompts require THREE signals:
//   1. A "Yes" option visible  (primary)
//   2. A "No" option visible   (primary)
//   3. A contextual keyword    (secondary)
//
// Text-style y/n prompts are specific enough on their own.
// A slash-command autocomplete picker vetoes all matches.
// Only the last 25 terminal lines are scanned.
// ---------------------------------------------------------------------------

var (
	// Menu-style Yes option: "1. Yes", "❯ Yes", "> Yes", "Yes Allow once"
	apYesOption = regexp.MustCompile(`(?i)1\.?\s*Yes|[❯>]\s+Yes\b|Yes\s+(Allow once|and don't ask)`)
	// Menu-style No option: "2. No", "3. No", any numbered "No", "Deny", "No, exit", "Decline", "No, and tell", "Cancel this"
	apNoOption  = regexp.MustCompile(`(?i)\d+\.?\s*No\b|[❯>]\s+No\b|\bDeny\b|No,?\s+exit|\bDecline\b|No,\s+and\s+tell|Go back without|Cancel this`)
	// Secondary context signal — at least one must accompany a menu prompt
	apSecondary = regexp.MustCompile(`(?i)` +
		`\bBash\b|\bRead\b|\bWrite\b|\bEdit\b|\bWebFetch\b|\bWebSearch\b|\bGrep\b|\bGlob\b|\bNotebookEdit\b|` +
		`\bexecute\b|` +
		`Do you want|want to proceed|wants to (?:execute|run)|` +
		`\bpermission\b|allow (?:once|always)|` +
		`trust this (?:folder|project)|safety check|` +
		`requires confirmation|Do you trust|created or one you trust|` +
		`Would you like to|Allow Codex to|Approve app tool call|` +
		`may have side effects|Enable full access|just this once|Run the tool|Decline this`)
	// Slash-command autocomplete picker line
	apSlashPicker = regexp.MustCompile(`(?m)^\s*/\S+\s{2,}\S`)

	// Text-style y/n prompts (specific patterns, lower false-positive risk)
	apReYN1        = regexp.MustCompile(`(?im)\(Y/n\)\s*$`)
	apReYN2        = regexp.MustCompile(`(?im)\(y/N\)\s*$`)
	apReYN3        = regexp.MustCompile(`(?im)\[y/n\]\s*$`)
	apReYN4        = regexp.MustCompile(`(?im)\[Y/n\]\s*$`)
	apReConfirm    = regexp.MustCompile(`(?i)confirm\? \(y/n\)`)
	apRePressEnter = regexp.MustCompile(`(?i)press enter to continue`)
	apReContinue   = regexp.MustCompile(`(?i)continue\? \[y/n\]`)
	apReAllow      = regexp.MustCompile(`(?i)Allow.*\(y/n\)`)
	apReProceed    = regexp.MustCompile(`(?i)proceed\?\s*\(y/n\)`)

	// API error patterns — trigger "continue" with exponential backoff
	apAPIError500 = regexp.MustCompile(`(?i)API Error:\s*500`)
)

func matchPrompt(text string) string {
	// Only scan the last 25 lines
	lines := strings.Split(text, "\n")
	if len(lines) > 25 {
		lines = lines[len(lines)-25:]
	}
	recent := strings.Join(lines, "\n")

	// Veto: slash command autocomplete picker is open
	matches := apSlashPicker.FindAllString(recent, -1)
	if len(matches) >= 2 {
		return ""
	}

	// --- Menu-style prompts (send Enter) ---
	// Two-tier: Yes option + No option + secondary context signal
	if apYesOption.MatchString(recent) && apNoOption.MatchString(recent) && apSecondary.MatchString(recent) {
		return "\r"
	}

	// --- Text-style y/n prompts ---
	if apReYN1.MatchString(recent)        { return "y\r" }
	if apReYN2.MatchString(recent)        { return "y\r" }
	if apReYN3.MatchString(recent)        { return "y\r" }
	if apReYN4.MatchString(recent)        { return "y\r" }
	if apReConfirm.MatchString(recent)    { return "y\r" }
	if apRePressEnter.MatchString(recent) { return "\r" }
	if apReContinue.MatchString(recent)   { return "y\r" }
	if apReAllow.MatchString(recent)      { return "y\r" }
	if apReProceed.MatchString(recent)    { return "y\r" }
	return ""
}

var (
	sessions   = make(map[string]*session)
	sessionsMu sync.Mutex
)

// serverListener is the Unix socket listener, stored at package level
// so the tray exit handler can close it for clean shutdown.
var serverListener net.Listener

// sessionEnv returns a clean environment for spawned terminal processes.
// It strips variables inherited from Electron / VS Code that should not
// leak into user terminal sessions and ensures sensible defaults.
func sessionEnv() []string {
	stripPrefixes := []string{
		"NODE_OPTIONS=",
		"ELECTRON_",
		"VSCODE_INSPECTOR_OPTIONS=",
		"NODE_ENV=",
		"INIT_CWD=",
	}

	raw := os.Environ()
	env := make([]string, 0, len(raw))
	hasLang := false
	for _, e := range raw {
		skip := false
		for _, prefix := range stripPrefixes {
			if strings.HasPrefix(e, prefix) {
				skip = true
				break
			}
		}
		if skip {
			continue
		}
		if strings.HasPrefix(e, "LANG=") || strings.HasPrefix(e, "LC_ALL=") {
			hasLang = true
		}
		env = append(env, e)
	}
	if !hasLang {
		env = append(env, "LANG=en_US.UTF-8", "LC_ALL=en_US.UTF-8")
	}
	env = append(env, "TERM=xterm-256color", "COLORTERM=truecolor")
	return env
}

// newSession creates a new conductord session backed by a PTY process.
// If command is non-empty, it is executed inside a login shell; otherwise
// a plain login shell is started. `shellPref` selects which shell binary
// to launch — empty string picks the platform default.
func newSession(id, cwd, command, shellPref string) (*session, error) {
	ptmx, err := gopty.New()
	if err != nil {
		return nil, err
	}

	shell := getShell(shellPref)
	var cmd *gopty.Cmd

	if command != "" {
		trimmed := strings.TrimRight(command, "\r\n")
		args := sessionShellCommandArgs(shell, trimmed)
		cmd = ptmx.Command(shell, args...)
		log.Printf("[session %s] starting with command (shell=%s): %s", id, shell, command)
	} else {
		args := sessionShellLoginArgs(shell)
		cmd = ptmx.Command(shell, args...)
		log.Printf("[session %s] starting login shell: %s", id, shell)
	}

	cmd.Dir = cwd
	cmd.Env = sessionEnv()

	if err := cmd.Start(); err != nil {
		ptmx.Close()
		return nil, err
	}

	emu := vt.NewEmulator(80, 24)
	emu.SetScrollbackSize(1000)

	s := &session{
		id:         id,
		cwd:        cwd,
		command:    command,
		ptmx:       ptmx,
		cmd:        cmd,
		scrollback: make([]byte, scrollbackSize),
		vterm:      emu,
	}

	go s.readLoop()

	go func() {
		err := s.cmd.Wait()
		s.mu.Lock()
		s.dead = true
		conn := s.conn
		s.mu.Unlock()
		if conn != nil {
			conn.Close()
		}
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				log.Printf("[session %s] process exited with code %d: %v", id, exitErr.ExitCode(), exitErr)
				if sig := exitSignal(exitErr); sig != "" {
					log.Printf("[session %s] killed by signal: %s", id, sig)
				}
			} else {
				log.Printf("[session %s] process exited with error: %v", id, err)
			}
		} else {
			log.Printf("[session %s] process exited (status 0)", id)
		}

		sessionsMu.Lock()
		delete(sessions, id)
		sessionsMu.Unlock()
	}()

	return s, nil
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
			var apDelay time.Duration = 150 * time.Millisecond
			if s.autoPilot {
				s.apBuf = append(s.apBuf, data...)
				if len(s.apBuf) > 4096 {
					s.apBuf = s.apBuf[len(s.apBuf)-4096:]
				}
				now := time.Now().UnixMilli()
				if now >= s.ap500Until && now-s.apLastMs >= 250 {
					stripped := stripAnsi(string(s.apBuf))
					// Log the tail of the scanned buffer for debugging
					tail := stripped
					if len(tail) > 300 {
						tail = tail[len(tail)-300:]
					}
					apResponse = matchPrompt(stripped)
					if apResponse != "" {
						log.Printf("[autopilot %s] matched prompt, sending %q after %v (scanned %d bytes, tail: %q)", s.id, apResponse, apDelay, len(stripped), tail)
						s.apLastMs = now
						s.apBuf = nil
						s.ap500Count = 0 // reset backoff on normal prompt match
					} else if apAPIError500.MatchString(stripped) {
						// Exponential backoff: 1s, 2s, 4s, … ceiling 2min
						s.ap500Count++
						backoff := time.Second
						for i := 1; i < s.ap500Count; i++ {
							backoff *= 2
							if backoff > 2*time.Minute {
								backoff = 2 * time.Minute
								break
							}
						}
						apResponse = "continue\r"
						apDelay = backoff
						s.ap500Until = now + backoff.Milliseconds()
						s.apLastMs = now
						s.apBuf = nil
						log.Printf("[autopilot %s] API Error 500 #%d, sending 'continue' after %v", s.id, s.ap500Count, backoff)
					}
				}
			}
			s.mu.Unlock()

			// Feed data to VT emulator for rendered state capture
			s.vtMu.Lock()
			s.vterm.Write(data)
			s.vtMu.Unlock()

			// Forward to attached client
			if conn != nil {
				if werr := conn.WriteMessage(websocket.BinaryMessage, data); werr != nil {
					s.mu.Lock()
					s.conn = nil
					s.mu.Unlock()
				}
			}

			// Send autopilot response after delay
			if apResponse != "" {
				resp := apResponse
				delay := apDelay

				// Notify attached client that autopilot matched a prompt
				// BEFORE sending the auto-response, so the UI can react.
				if conn != nil {
					payload := map[string]interface{}{
						"type":     "autopilot_match",
						"response": resp,
					}
					_ = conn.WriteJSON(payload)
				}
				go func() {
					time.Sleep(delay)
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

// renderState returns the terminal's rendered state (scrollback + visible
// screen) as ANSI-formatted text. The VT emulator interprets the raw PTY
// byte stream so the output is a clean cell-grid snapshot rather than a
// raw replay of escape sequences.
func (s *session) renderState() string {
	s.vtMu.RLock()
	defer s.vtMu.RUnlock()

	var buf strings.Builder

	// Render scrollback lines (oldest first)
	sb := s.vterm.Scrollback()
	if sb != nil {
		for i := 0; i < sb.Len(); i++ {
			line := sb.Line(i)
			if line != nil {
				buf.WriteString(line.Render())
			}
			buf.WriteByte('\n')
		}
	}

	// Render visible screen
	buf.WriteString(s.vterm.Render())

	return buf.String()
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
	_ = s.ptmx.Resize(int(cols), int(rows))
	s.vtMu.Lock()
	s.vterm.Resize(int(cols), int(rows))
	s.vtMu.Unlock()
}

func (s *session) kill() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.dead && s.cmd.Process != nil {
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

func handleTerminal(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade error: %v", err)
		return
	}

	id := r.URL.Query().Get("id")
	cwd := r.URL.Query().Get("cwd")
	command := r.URL.Query().Get("command")
	shellPref := r.URL.Query().Get("shell")
	if cwd == "" {
		home, _ := os.UserHomeDir()
		cwd = home
	}
	// Validate that cwd exists — Go returns a confusing "no such file or
	// directory" error on the shell binary when the working directory is
	// missing.
	if _, err := os.Stat(cwd); err != nil {
		home, _ := os.UserHomeDir()
		log.Printf("[session %s] cwd %q does not exist, falling back to %s", id, cwd, home)
		cwd = home
	}

	sessionsMu.Lock()
	s, exists := sessions[id]
	// If the session exists but its PTY process is dead, discard it and
	// create a fresh one.
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
		s, err = newSession(id, cwd, command, shellPref)
		if err != nil {
			sessionsMu.Unlock()
			log.Printf("session create error: %v", err)
			conn.WriteJSON(map[string]string{"type": "error", "data": err.Error()})
			conn.Close()
			return
		}
		sessions[id] = s
		isNew = true
	} else if !exists {
		id = fmt.Sprintf("s-%d", time.Now().UnixNano())
		s, err = newSession(id, cwd, command, shellPref)
		if err != nil {
			sessionsMu.Unlock()
			log.Printf("session create error: %v", err)
			conn.WriteJSON(map[string]string{"type": "error", "data": err.Error()})
			conn.Close()
			return
		}
		sessions[id] = s
		isNew = true
	} else {
		log.Printf("[session %s] reattached (existing conductord session)", id)
	}
	sessionsMu.Unlock()

	// Send session info to client.
	// isNew=true means a new process was spawned → client should send its
	// initialCommand. isNew=false means we reattached to an existing session.
	s.mu.Lock()
	ap := s.autoPilot
	s.mu.Unlock()
	conn.WriteJSON(map[string]interface{}{"type": "session", "data": s.id, "isNew": isNew, "autoPilot": ap})

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
			s.ap500Count = 0
			s.ap500Until = 0
			s.mu.Unlock()
			log.Printf("[session %s] autopilot %v", s.id, enabled)
		case "capture-scrollback":
			// Return the scrollback buffer content to the client.
			sb := s.getScrollback()
			conn.WriteJSON(map[string]interface{}{
				"type": "scrollback",
				"data": string(sb),
			})
		}
	}
}

// ---------------------------------------------------------------------------
// REST endpoints
// ---------------------------------------------------------------------------

type sessionInfo struct {
	ID      string `json:"id"`
	Dead    bool   `json:"dead"`
	Cwd     string `json:"cwd"`
	Command string `json:"command"`
}

func handleSessions(w http.ResponseWriter, r *http.Request) {
	// DELETE /api/sessions/{id} — kill a session
	if r.Method == http.MethodDelete {
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
		list = append(list, sessionInfo{ID: s.id, Dead: s.dead, Cwd: s.cwd, Command: s.command})
		s.mu.Unlock()
	}
	sessionsMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
	})
}

// killAllSessions kills all active sessions. Used during shutdown.
func killAllSessions() {
	sessionsMu.Lock()
	for id, s := range sessions {
		s.kill()
		log.Printf("[session %s] killed during shutdown", id)
	}
	sessionsMu.Unlock()
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
	if _, err := os.Stat(cwd); err != nil {
		home, _ := os.UserHomeDir()
		log.Printf("[exec] cwd %q does not exist, falling back to %s", cwd, home)
		cwd = home
	}

	log.Printf("[exec] starting: %s (cwd=%s, timeout=%ds)", req.Command, cwd, timeout)

	cmd := buildExecCommand(req.Command, req.Args)
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

// startServer registers HTTP handlers, binds the Unix socket, and starts
// serving in a background goroutine. It fatals if the socket cannot be
// created. The listener is stored in serverListener for clean shutdown.
func startServer(socketPath string, devPort int) {
	// Ensure parent directory exists.
	if err := os.MkdirAll(filepath.Dir(socketPath), 0755); err != nil {
		log.Fatalf("failed to create socket directory: %v", err)
	}

	// Check if another conductord instance is already running on this socket.
	if _, err := os.Stat(socketPath); err == nil {
		if healthCheckUnix(socketPath) {
			log.Printf("conductord already running on %s, exiting", socketPath)
			os.Exit(0)
		}
		// Stale socket file — remove it.
		log.Printf("removing stale socket file %s", socketPath)
		os.Remove(socketPath)
	}

	http.HandleFunc("/ws/terminal", handleTerminal)
	http.HandleFunc("/api/sessions/", cors(handleSessions))
	http.HandleFunc("/api/sessions", cors(handleSessions))
	http.HandleFunc("/api/exec", cors(handleExec))
	http.HandleFunc("/health", cors(handleHealth))

	ln, err := net.Listen("unix", socketPath)
	if err != nil {
		log.Fatalf("listen error: %v", err)
	}
	os.Chmod(socketPath, 0600)
	serverListener = ln

	// Optional TCP listener for web dev mode.
	if devPort > 0 {
		devAddr := fmt.Sprintf("127.0.0.1:%d", devPort)
		devLn, err := net.Listen("tcp", devAddr)
		if err != nil {
			log.Printf("[dev] TCP listen on %s failed: %v (continuing with socket only)", devAddr, err)
		} else {
			log.Printf("[dev] also listening on %s", devAddr)
			go http.Serve(devLn, nil)
		}
	}

	log.Printf("conductord listening on %s", socketPath)
	go http.Serve(ln, nil)
}

// initLogFile redirects the standard logger to the log file (appending),
// while also keeping stderr output for debugging.
func initLogFile() {
	path := logFilePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		log.Printf("failed to create log directory: %v", err)
		return
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		log.Printf("failed to open log file %s: %v", path, err)
		return
	}
	log.SetOutput(io.MultiWriter(os.Stderr, f))
}

func main() {
	socketPath := flag.String("socket", defaultSocketPath(), "Unix socket path")
	devPort := flag.Int("dev-port", 0, "optional TCP port for web dev mode (0 = disabled)")
	trayMode := flag.Bool("tray", false, "show system tray icon instead of running as a headless daemon")
	flag.Parse()

	// Write logs to ~/Library/Logs/conductord.log as well as stderr.
	initLogFile()

	// Start HTTP server in background.
	startServer(*socketPath, *devPort)

	if *trayMode {
		// runTray blocks on the main goroutine (macOS Cocoa event loop).
		// It handles SIGTERM/SIGINT internally and cleans up on exit.
		runTray(*socketPath)
	} else {
		// Headless daemon mode — wait for signal.
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
		<-sigCh
		log.Printf("shutting down, removing socket %s", *socketPath)
		killAllSessions()
		os.Remove(*socketPath)
	}
}
