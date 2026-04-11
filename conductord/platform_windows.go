//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"fyne.io/systray"
)

// setTrayIcon installs the Windows ICO-wrapped tray icon.
func setTrayIcon() {
	systray.SetIcon(trayIconICO)
}

// getShell resolves the shell preference to an absolute path. An empty `pref`
// or "default" picks the platform default (PowerShell, falling back to cmd.exe).
// Well-known names ("powershell", "pwsh", "cmd", "git-bash", "bash") are
// resolved via PATH or standard install locations. Any other value is treated
// as a literal path. go-pty's Command() does not search PATH the way os/exec
// does, so we always resolve to a full path here.
func getShell(pref string) string {
	switch pref {
	case "", "default":
		// CONDUCTORD_SHELL env var still honored for backwards compatibility.
		if os.Getenv("CONDUCTORD_SHELL") == "cmd" {
			if s := os.Getenv("COMSPEC"); s != "" {
				return s
			}
		}
		if p, err := exec.LookPath("powershell.exe"); err == nil {
			return p
		}
		if s := os.Getenv("COMSPEC"); s != "" {
			return s
		}
		return "cmd.exe"
	case "powershell":
		if p, err := exec.LookPath("powershell.exe"); err == nil {
			return p
		}
		return "powershell.exe"
	case "pwsh":
		if p, err := exec.LookPath("pwsh.exe"); err == nil {
			return p
		}
		return "pwsh.exe"
	case "cmd":
		if s := os.Getenv("COMSPEC"); s != "" {
			return s
		}
		return "cmd.exe"
	case "git-bash", "gitbash":
		// Common Git for Windows install locations.
		candidates := []string{
			`C:\Program Files\Git\bin\bash.exe`,
			`C:\Program Files (x86)\Git\bin\bash.exe`,
		}
		if pf := os.Getenv("ProgramFiles"); pf != "" {
			candidates = append(candidates, filepath.Join(pf, "Git", "bin", "bash.exe"))
		}
		if pf := os.Getenv("ProgramFiles(x86)"); pf != "" {
			candidates = append(candidates, filepath.Join(pf, "Git", "bin", "bash.exe"))
		}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				return c
			}
		}
		// Fall back to whatever bash.exe is on PATH (WSL's bash sits at
		// C:\Windows\System32\bash.exe, which isn't what we want, but
		// exec.LookPath will still find git's bash if it's earlier on PATH).
		if p, err := exec.LookPath("bash.exe"); err == nil {
			return p
		}
		return "bash.exe"
	default:
		// Treat as a literal path or PATH-resolvable binary.
		if p, err := exec.LookPath(pref); err == nil {
			return p
		}
		return pref
	}
}

// sessionShellLoginArgs returns args for starting a login-like shell in a
// PTY. The choice depends on the shell binary.
func sessionShellLoginArgs(shell string) []string {
	base := strings.ToLower(filepath.Base(shell))
	switch base {
	case "bash.exe", "bash":
		return []string{"--login", "-i"}
	case "cmd.exe", "cmd":
		return nil
	default:
		// PowerShell / pwsh — start with the default profile.
		return nil
	}
}

// sessionShellCommandArgs returns args for running a one-shot command in the
// given shell and leaving the user in an interactive shell afterwards.
func sessionShellCommandArgs(shell, command string) []string {
	base := strings.ToLower(filepath.Base(shell))
	switch base {
	case "bash.exe", "bash":
		// POSIX-style: run the command, then exec a fresh interactive shell
		// so the user is dropped into bash when the command exits.
		return []string{"--login", "-i", "-c", command + "; exec bash --login -i"}
	case "cmd.exe", "cmd":
		// /k keeps cmd.exe alive after running the command.
		return []string{"/k", command}
	default:
		// PowerShell / pwsh — -NoExit keeps the shell alive after the command.
		return []string{"-NoExit", "-Command", command}
	}
}

// buildExecCommand constructs an *exec.Cmd that runs `command args...`
// directly. On Windows we skip the shell-wrapping trick used on Unix because
// PowerShell/cmd quoting rules differ and exec.Command handles argv quoting.
func buildExecCommand(command string, args []string) *exec.Cmd {
	return exec.Command(command, args...)
}

// logFilePath returns the conductord log file path on Windows.
// Uses %LOCALAPPDATA%\conductord\conductord.log, falling back to the temp dir.
func logFilePath() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			base = os.TempDir()
		} else {
			base = filepath.Join(home, "AppData", "Local")
		}
	}
	return filepath.Join(base, "conductord", "conductord.log")
}

// exitSignal on Windows always returns "" because processes are not
// terminated by POSIX signals.
func exitSignal(_ *exec.ExitError) string {
	return ""
}
