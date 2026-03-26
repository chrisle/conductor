import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'

const PLIST_NAME = 'com.conductor.conductord'
const PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', `${PLIST_NAME}.plist`)

function getConductordBinPath(): string {
  const isDev = !!process.env['ELECTRON_RENDERER_URL']
  if (isDev) {
    return path.join(__dirname, '../../conductord/conductord')
  }
  return path.join(process.resourcesPath!, 'conductord')
}

function buildPlist(): string {
  const binPath = getConductordBinPath()
  const logPath = path.join(os.homedir(), 'Library', 'Logs', 'conductord.log')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_NAME}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${binPath}</string>
    <string>-port</string>
    <string>9800</string>
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
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
