package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"fyne.io/systray"
)

// runTray starts the system tray icon and blocks on the main goroutine.
// On macOS the Cocoa event loop must run on the main thread, so this
// must be called from main().
func runTray(socketPath string) {
	// Forward SIGTERM/SIGINT to the tray quit handler for clean shutdown.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-sigCh
		systray.Quit()
	}()

	systray.Run(
		func() { onTrayReady(socketPath) },
		func() { onTrayExit(socketPath) },
	)
}

func onTrayReady(socketPath string) {
	systray.SetTemplateIcon(trayIconBytes, trayIconBytes)
	systray.SetTooltip("Conductor")

	mTitle := systray.AddMenuItem("Conductor", "")
	mTitle.Disable()

	mSessions := systray.AddMenuItem("No active sessions", "")
	mSessions.Disable()

	systray.AddSeparator()

	mOpen := systray.AddMenuItem("Open Conductor", "Open the Conductor window")

	systray.AddSeparator()

	mQuit := systray.AddMenuItem("Quit Conductor", "Stop all sessions and quit")

	// Periodically update session count in the menu.
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			sessionsMu.Lock()
			n := len(sessions)
			sessionsMu.Unlock()
			switch n {
			case 0:
				mSessions.SetTitle("No active sessions")
			case 1:
				mSessions.SetTitle("1 active session")
			default:
				mSessions.SetTitle(fmt.Sprintf("%d active sessions", n))
			}
		}
	}()

	// Handle menu item clicks.
	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				openConductorApp()
			case <-mQuit.ClickedCh:
				log.Println("[tray] quit requested by user")
				systray.Quit()
			}
		}
	}()
}

func onTrayExit(socketPath string) {
	log.Println("[tray] shutting down")
	killTmuxServer()
	if serverListener != nil {
		serverListener.Close()
	}
	os.Remove(socketPath)
	os.Exit(0)
}

func openConductorApp() {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", "-a", "Conductor")
	case "linux":
		cmd = exec.Command("xdg-open", "conductor")
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "conductor")
	default:
		return
	}
	if err := cmd.Start(); err != nil {
		log.Printf("[tray] failed to open Conductor app: %v", err)
	}
}
