import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { shell } from 'electron'
import { CONDUCTORD_SOCKET } from './conductord-client'

const PLIST_NAME = 'com.conductor.conductord'
const PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', `${PLIST_NAME}.plist`)
const APP_BUNDLE_DIR = path.join(os.homedir(), '.conductor', 'Conductor Service.app')
const APP_BUNDLE_BIN = path.join(APP_BUNDLE_DIR, 'Contents', 'MacOS', 'conductord')

function getSourceBinPath(): string {
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  if (isDev) {
    return path.join(__dirname, '../../conductord/conductord')
  }
  return path.join(process.resourcesPath!, 'conductord')
}

function getSourceIconPath(): string {
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  if (isDev) {
    return path.join(__dirname, '../../conductord/embedded/AppIcon.icns')
  }
  return path.join(process.resourcesPath!, 'AppIcon.icns')
}

/**
 * Creates a minimal .app bundle so macOS displays "Conductor Service" with an
 * icon in System Settings > Privacy & Security instead of the raw binary name.
 */
function ensureAppBundle(): void {
  const contentsDir = path.join(APP_BUNDLE_DIR, 'Contents')
  const macosDir = path.join(contentsDir, 'MacOS')
  const resourcesDir = path.join(contentsDir, 'Resources')

  fs.mkdirSync(macosDir, { recursive: true })
  fs.mkdirSync(resourcesDir, { recursive: true })

  // Copy binary
  const srcBin = getSourceBinPath()
  fs.copyFileSync(srcBin, APP_BUNDLE_BIN)
  fs.chmodSync(APP_BUNDLE_BIN, 0o755)

  // Copy icon
  const srcIcon = getSourceIconPath()
  if (fs.existsSync(srcIcon)) {
    fs.copyFileSync(srcIcon, path.join(resourcesDir, 'AppIcon.icns'))
  }

  // Write Info.plist
  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>${PLIST_NAME}</string>
  <key>CFBundleName</key>
  <string>Conductor Service</string>
  <key>CFBundleDisplayName</key>
  <string>Conductor Service</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>conductord</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`
  fs.writeFileSync(path.join(contentsDir, 'Info.plist'), infoPlist, 'utf-8')
}

function buildPlist(): string {
  const logPath = path.join(os.homedir(), 'Library', 'Logs', 'conductord.log')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${APP_BUNDLE_BIN}</string>
    <string>-socket</string>
    <string>${CONDUCTORD_SOCKET}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>
`
}

export function isInstalled(): boolean {
  return fs.existsSync(PLIST_PATH)
}

export function install(): { success: boolean; error?: string } {
  try {
    // Create the .app bundle so macOS shows "Conductor Service" in security settings
    ensureAppBundle()

    const launchAgentsDir = path.dirname(PLIST_PATH)
    if (!fs.existsSync(launchAgentsDir)) {
      fs.mkdirSync(launchAgentsDir, { recursive: true })
    }

    fs.writeFileSync(PLIST_PATH, buildPlist(), 'utf-8')
    execSync(`launchctl load -w "${PLIST_PATH}"`)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function start(): { success: boolean; error?: string } {
  try {
    execSync(`launchctl start ${PLIST_NAME}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function stop(): { success: boolean; error?: string } {
  try {
    execSync(`launchctl stop ${PLIST_NAME}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export function restart(): { success: boolean; error?: string } {
  try {
    execSync(`launchctl kickstart -k gui/${process.getuid!()}/${PLIST_NAME}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// FDA check is now done via conductord's /health endpoint (see ipc.ts),
// since it's the conductord process that needs FDA, not Electron.

export function openFullDiskAccessSettings(): void {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
}

export function uninstall(): { success: boolean; error?: string } {
  try {
    if (fs.existsSync(PLIST_PATH)) {
      try {
        execSync(`launchctl unload "${PLIST_PATH}"`)
      } catch {
        // May already be unloaded
      }
      fs.unlinkSync(PLIST_PATH)
    }
    // Remove the .app bundle
    if (fs.existsSync(APP_BUNDLE_DIR)) {
      fs.rmSync(APP_BUNDLE_DIR, { recursive: true, force: true })
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
