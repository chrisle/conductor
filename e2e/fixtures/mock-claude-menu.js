#!/usr/bin/env node
/**
 * Mock Claude Code interactive menu for autopilot E2E testing.
 *
 * Prints a "Do you want to create Dockerfile?" prompt that looks like
 * real Claude Code output, then waits for input in raw mode.
 *
 * - If it receives Enter (\r or \n) → prints "PASS"
 * - Anything else → prints "FAIL"
 * - Times out after 10 seconds → prints "FAIL: timeout"
 */

const MENU = [
  '',
  ' Do you want to create Dockerfile?',
  ' \u276F 1. Yes',
  '   2. Yes, allow all edits during this session (shift+tab)',
  '   3. No',
  '',
].join('\n')

// Small delay so the test has time to enable autopilot before the menu appears
setTimeout(() => {
  process.stdout.write(MENU)

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
  process.stdin.resume()
  process.stdin.setEncoding('utf8')

  let responded = false

  process.stdin.on('data', (key) => {
    if (responded) return
    responded = true

    if (key === '\r' || key === '\n') {
      process.stdout.write('\nPASS\n')
    } else {
      process.stdout.write('\nFAIL: received ' + JSON.stringify(key) + '\n')
    }
    setTimeout(() => process.exit(0), 100)
  })

  // Timeout safety net
  setTimeout(() => {
    if (responded) return
    process.stdout.write('\nFAIL: timeout\n')
    process.exit(1)
  }, 10000)
}, 500)
