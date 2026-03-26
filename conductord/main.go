package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"runtime"
	"sync"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

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
}

var (
	sessions   = make(map[string]*session)
	sessionsMu sync.Mutex
)

func newSession(id, cwd string) (*session, error) {
	shell := getShell()
	cmd := exec.Command(shell, "-l")
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")

	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, err
	}

	s := &session{
		id:         id,
		ptmx:       ptmx,
		cmd:        cmd,
		scrollback: make([]byte, scrollbackSize),
	}

	// PTY reader goroutine — runs for the lifetime of the session
	go s.readLoop()

	// Watch for process exit
	go func() {
		s.cmd.Wait()
		s.mu.Lock()
		s.dead = true
		conn := s.conn
		s.mu.Unlock()
		if conn != nil {
			conn.Close()
		}
		log.Printf("[session %s] process exited", id)

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
			s.mu.Unlock()

			// Forward to attached client
			if conn != nil {
				if werr := conn.WriteMessage(websocket.BinaryMessage, data); werr != nil {
					s.mu.Lock()
					s.conn = nil
					s.mu.Unlock()
				}
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
	if !exists && id != "" {
		// Create new session with the given ID
		s, err = newSession(id, cwd)
		if err != nil {
			sessionsMu.Unlock()
			log.Printf("session create error: %v", err)
			conn.WriteJSON(map[string]string{"type": "error", "data": err.Error()})
			conn.Close()
			return
		}
		sessions[id] = s
		log.Printf("[session %s] created (cwd: %s)", id, cwd)
	} else if !exists {
		// No ID provided — generate one
		id = fmt.Sprintf("s-%d", time.Now().UnixNano())
		s, err = newSession(id, cwd)
		if err != nil {
			sessionsMu.Unlock()
			log.Printf("session create error: %v", err)
			conn.WriteJSON(map[string]string{"type": "error", "data": err.Error()})
			conn.Close()
			return
		}
		sessions[id] = s
		log.Printf("[session %s] created (cwd: %s)", id, cwd)
	} else {
		log.Printf("[session %s] reattached", id)
	}
	sessionsMu.Unlock()

	// Send session ID to client (useful if server generated it)
	conn.WriteJSON(map[string]string{"type": "session", "data": s.id})

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

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func main() {
	port := flag.Int("port", 9800, "port to listen on")
	flag.Parse()

	addr := fmt.Sprintf("127.0.0.1:%d", *port)

	// Check if another conductord instance is already running on this port.
	// If so, exit cleanly to avoid a launchd restart loop.
	resp, err := http.Get(fmt.Sprintf("http://%s/health", addr))
	if err == nil {
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			log.Printf("conductord already running on %s, exiting", addr)
			os.Exit(0)
		}
	}

	http.HandleFunc("/ws/terminal", handleTerminal)
	http.HandleFunc("/api/sessions", cors(handleSessions))
	http.HandleFunc("/api/exec", cors(handleExec))
	http.HandleFunc("/health", cors(handleHealth))

	// Try to bind with a raw listener first so we can detect EADDRINUSE
	// and exit cleanly instead of crashing (avoids launchd restart loops).
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		if strings.Contains(err.Error(), "address already in use") {
			log.Printf("port %d already in use, assuming another conductord is running — exiting cleanly", *port)
			os.Exit(0)
		}
		log.Fatalf("listen error: %v", err)
	}

	log.Printf("conductord listening on %s", addr)
	if err := http.Serve(ln, nil); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
