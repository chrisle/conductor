//go:build !windows

package main

import (
	"strings"
	"sync"
	"testing"
	"time"

	gopty "github.com/aymanbagabas/go-pty"
	"github.com/charmbracelet/x/vt"
)

// buildTestSession returns a minimal *session with a real PTY (no child
// process) and a running vtFeedLoop, sufficient for exercising resize,
// getScrollback, and the vtCh backpressure path without spawning a shell.
func buildTestSession(t *testing.T) *session {
	t.Helper()
	ptmx, err := gopty.New()
	if err != nil {
		t.Fatalf("gopty.New: %v", err)
	}
	emu := vt.NewEmulator(80, 24)
	emu.SetScrollbackSize(1000)
	s := &session{
		id:         "t",
		ptmx:       ptmx,
		scrollback: make([]byte, scrollbackSize),
		vterm:      emu,
		vtCh:       make(chan []byte, 256),
	}
	go s.vtFeedLoop()
	t.Cleanup(func() {
		// Closing vtCh lets vtFeedLoop exit; swallow the "already closed"
		// from tests that close it explicitly.
		defer func() { _ = recover() }()
		close(s.vtCh)
		ptmx.Close()
	})
	return s
}

// TestResizeDoesNotBlockOnVtMutex reproduces the "typing dies while dragging
// the window" regression. Before the fix, session.resize held vtMu inline on
// the WebSocket input loop — a slow vterm.Resize would back up every
// subsequent input message. The fix dispatches vterm.Resize to a goroutine.
func TestResizeDoesNotBlockOnVtMutex(t *testing.T) {
	s := buildTestSession(t)

	// Hold vtMu for 300ms from another goroutine.
	holder := make(chan struct{})
	go func() {
		s.vtMu.Lock()
		close(holder)
		time.Sleep(300 * time.Millisecond)
		s.vtMu.Unlock()
	}()
	<-holder // ensure the mutex is held before we call resize

	start := time.Now()
	s.resize(100, 30)
	if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
		t.Fatalf("session.resize blocked on vtMu for %v (expected <50ms) — vterm.Resize must run off the input loop", elapsed)
	}
}

// TestInputPathNotBlockedByResize guarantees that, while a resize is in flight
// (the VT side is busy), subsequent PTY input writes still go through
// promptly. This is the user-visible symptom of the earlier regression:
// keystrokes pause during window drags.
func TestInputPathNotBlockedByResize(t *testing.T) {
	s := buildTestSession(t)

	// Simulate a slow VT op on the critical section.
	go func() {
		s.vtMu.Lock()
		time.Sleep(200 * time.Millisecond)
		s.vtMu.Unlock()
	}()
	time.Sleep(5 * time.Millisecond)
	s.resize(100, 30) // hops onto a goroutine; returns instantly

	// Write to the PTY. Must return quickly — it should not touch vtMu.
	start := time.Now()
	_, err := s.ptmx.Write([]byte("x"))
	if err != nil {
		t.Fatalf("ptmx.Write: %v", err)
	}
	if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
		t.Fatalf("ptmx.Write blocked for %v — input path must be independent of vt mutex", elapsed)
	}
}

// TestScrollbackPreservesModeTransitions guards the "can't type into claude
// after reattach" regression. The VT-rendered snapshot strips mode
// transitions (alt-screen, mouse, bracketed paste) that a reattaching TUI
// needs. Raw scrollback must keep them byte-for-byte.
func TestScrollbackPreservesModeTransitions(t *testing.T) {
	s := buildTestSession(t)

	// Every escape below affects an input/rendering mode that claude (or any
	// other alt-screen TUI) flips on at startup. If capture-scrollback ever
	// returns the rendered grid instead of these raw bytes, a reattached
	// xterm will be in the wrong buffer and input will appear dead.
	critical := []string{
		"\x1b[?1049h", // alt-screen enter
		"\x1b[?1000h", // mouse X10 reporting
		"\x1b[?1006h", // mouse SGR reporting
		"\x1b[?2004h", // bracketed paste mode
		"\x1b[?25l",   // cursor hide
		"\x1b[?1h",    // application cursor keys
	}
	payload := []byte(strings.Join(critical, "") + "claude-tui-paint")

	s.mu.Lock()
	for _, b := range payload {
		s.scrollback[s.sbPos] = b
		s.sbPos = (s.sbPos + 1) % scrollbackSize
		if s.sbPos == 0 {
			s.sbFull = true
		}
	}
	s.mu.Unlock()

	got := string(s.getScrollback())
	for _, esc := range critical {
		if !strings.Contains(got, esc) {
			t.Errorf("getScrollback dropped mode transition %q — reattached TUI input would break", esc)
		}
	}
}

// TestVtChannelDropsInsteadOfBlocking is a regression for the blank-black
// bug: the PTY read loop must never block on the VT emulator. The channel
// that feeds the VT emulator is bounded; sends use a non-blocking select
// that drops on backpressure so readLoop can keep forwarding bytes to the
// client even if the VT falls behind.
func TestVtChannelDropsInsteadOfBlocking(t *testing.T) {
	s := buildTestSession(t)

	// Stall the feed loop by grabbing its mutex for a while.
	var stuck sync.WaitGroup
	stuck.Add(1)
	go func() {
		defer stuck.Done()
		s.vtMu.Lock()
		time.Sleep(300 * time.Millisecond)
		s.vtMu.Unlock()
	}()
	time.Sleep(5 * time.Millisecond)

	// Mirror readLoop's producer: non-blocking send, drop on full.
	start := time.Now()
	sent, dropped := 0, 0
	for i := 0; i < 2048; i++ {
		select {
		case s.vtCh <- []byte("chunk"):
			sent++
		default:
			dropped++
		}
	}
	elapsed := time.Since(start)
	if elapsed > 100*time.Millisecond {
		t.Fatalf("vtCh producer blocked %v — readLoop must never stall on VT backpressure (sent=%d dropped=%d)", elapsed, sent, dropped)
	}
	if dropped == 0 {
		t.Fatalf("expected some chunks dropped under backpressure; got sent=%d dropped=0", sent)
	}

	stuck.Wait()
}

// TestRawScrollbackContainsInputEchoSequences is a broader sanity check:
// common bytes emitted by a TUI during normal use (CSI cursor moves, SGR
// color changes) round-trip unchanged through getScrollback. A VT-rendered
// version of the same would lose these.
func TestRawScrollbackContainsInputEchoSequences(t *testing.T) {
	s := buildTestSession(t)

	samples := []string{
		"\x1b[2;5H",    // cursor position
		"\x1b[38;5;1m", // SGR 256-color
		"\x1b[K",       // erase line
		"\r\n",         // CRLF
	}
	payload := []byte(strings.Join(samples, "echoed-text"))

	s.mu.Lock()
	for _, b := range payload {
		s.scrollback[s.sbPos] = b
		s.sbPos = (s.sbPos + 1) % scrollbackSize
		if s.sbPos == 0 {
			s.sbFull = true
		}
	}
	s.mu.Unlock()

	got := string(s.getScrollback())
	for _, esc := range samples {
		if !strings.Contains(got, esc) {
			t.Errorf("scrollback missing %q", esc)
		}
	}
}
