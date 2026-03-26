import { context } from 'esbuild'
import fs from 'fs'
import path from 'path'
import os from 'os'

export async function dev(): Promise<void> {
  const cwd = process.cwd()

  const manifestPath = path.join(cwd, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    console.error('No manifest.json found. Are you in an extension directory?')
    process.exit(1)
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const entryPoint = findEntryPoint(cwd)
  if (!entryPoint) {
    console.error('No entry point found.')
    process.exit(1)
  }

  // Determine Conductor extensions directory
  const platform = os.platform()
  let extensionsDir: string
  if (platform === 'darwin') {
    extensionsDir = path.join(os.homedir(), 'Library', 'Application Support', 'Conductor', 'extensions')
  } else if (platform === 'win32') {
    extensionsDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Conductor', 'extensions')
  } else {
    extensionsDir = path.join(os.homedir(), '.config', 'Conductor', 'extensions')
  }

  const extDir = path.join(extensionsDir, manifest.id)
  if (!fs.existsSync(extDir)) {
    fs.mkdirSync(extDir, { recursive: true })
  }

  console.log(`Dev mode: watching for changes...`)
  console.log(`Output: ${extDir}`)

  const ctx = await context({
    entryPoints: [entryPoint],
    bundle: true,
    outfile: path.join(extDir, 'index.js'),
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    external: [
      'react',
      'react-dom',
      'zustand',
      'lucide-react',
      '@conductor/extension-api',
      '@conductor/extension-sdk'
    ],
    define: {
      'process.env.NODE_ENV': '"development"'
    },
    sourcemap: true
  })

  fs.copyFileSync(manifestPath, path.join(extDir, 'manifest.json'))

  await ctx.watch()
  console.log('Watching for changes... (Ctrl+C to stop)')
}

function findEntryPoint(cwd: string): string | null {
  const candidates = [
    'src/index.tsx',
    'src/index.ts',
    'src/index.jsx',
    'src/index.js'
  ]
  for (const c of candidates) {
    const full = path.join(cwd, c)
    if (fs.existsSync(full)) return full
  }
  return null
}
