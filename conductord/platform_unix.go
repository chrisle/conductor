//go:build !windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	"fyne.io/systray"
)

// setTrayIcon uses the PNG as a template image so macOS can recolor it
// automatically for light/dark menu bars.
func setTrayIcon() {
	systray.SetTemplateIcon(trayIconPNG, trayIconPNG)
}

// getShell resolves the shell preference to an absolute path. An empty `pref`
// or "default" picks $SHELL (or /bin/zsh as a last resort). Well-known names
// ("bash", "zsh", "fish") are resolved via PATH. Any other value is treated
// as a literal path.
func getShell(pref string) string {
	switch pref {
	case "", "default":
		if s := os.Getenv("SHELL"); s != "" {
			return s
		}
		return "/bin/zsh"
	case "bash", "zsh", "fish", "sh":
		if p, err := exec.LookPath(pref); err == nil {
			return p
		}
		return "/bin/" + pref
	default:
		if p, err := exec.LookPath(pref); err == nil {
			return p
		}
		return pref
	}
}

// sessionShellLoginArgs returns args for starting a bare login shell in a PTY.
func sessionShellLoginArgs(_ string) []string {
	return []string{"-l"}
}

// sessionShellCommandArgs returns args for running a command inside a login
// shell and then dropping into an interactive shell when the command exits.
func sessionShellCommandArgs(shell, command string) []string {
	return []string{"-lic", command + "; exec " + shell}
}

// shellQuote wraps a string in single quotes, escaping any embedded single quotes.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\"'\"'") + "'"
}

// buildExecCommand constructs an *exec.Cmd that runs `command args...` through
// the user's login shell so PATH, aliases, and profile are loaded.
func buildExecCommand(command string, args []string) *exec.Cmd {
	shell := getShell("")
	parts := make([]string, 0, 1+len(args))
	parts = append(parts, shellQuote(command))
	for _, a := range args {
		parts = append(parts, shellQuote(a))
	}
	shellCmd := strings.Join(parts, " ")
	return exec.Command(shell, "-ilc", shellCmd)
}

// logFilePath returns the conductord log file path on Unix.
func logFilePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home = os.TempDir()
	}
	return filepath.Join(home, "Library", "Logs", "conductord.log")
}

// exitSignal returns a human-readable name for the signal that killed a
// process, or "" if it was not killed by a signal.
func exitSignal(exitErr *exec.ExitError) string {
	if ws, ok := exitErr.Sys().(syscall.WaitStatus); ok && ws.Signaled() {
		return ws.Signal().String()
	}
	return ""
}
