import { extensionRegistry } from './registry'
import type { Extension } from './types'
import * as lucideReact from 'lucide-react'
import * as ReactJSXRuntime from 'react/jsx-runtime'

interface ExtensionManifest {
  id: string
  name: string
  version: string
  main: string
}

/** Maps directory paths to their loaded extension IDs (for dev/external extensions). */
export const dirPathToExtensionId = new Map<string, string>()

/**
 * Load a single external extension from a directory path.
 * The directory must contain a manifest.json and a bundled JS file.
 */
export async function loadExtension(dirPath: string): Promise<void> {
  const manifestPath = `${dirPath}/manifest.json`
  const manifestResult = await window.electronAPI.readFile(manifestPath)
  if (!manifestResult.success || !manifestResult.content) {
    throw new Error(`No manifest.json found at ${dirPath}`)
  }

  const manifest: ExtensionManifest = JSON.parse(manifestResult.content)
  const mainFile = manifest.main || 'index.js'
  // Try the primary path, then fall back to dist/ so that selecting the
  // project root folder works the same as selecting the built dist/ folder.
  const candidates = [`${dirPath}/${mainFile}`, `${dirPath}/dist/${mainFile}`]
  let bundleResult: Awaited<ReturnType<typeof window.electronAPI.readFile>> | null = null
  for (const candidate of candidates) {
    const result = await window.electronAPI.readFile(candidate)
    if (result.success && result.content) { bundleResult = result; break }
  }
  if (!bundleResult) {
    throw new Error(`Could not find bundle for "${manifest.id}" (tried: ${candidates.join(', ')})`)
  }

  // Execute the bundle in a sandboxed context
  // The bundle can access the host API via window.__conductorAPI__
  const module = { exports: {} as any }
  const wrappedCode = `(function(module, exports, require) {\n${bundleResult.content!}\n})`
  const factory = eval(wrappedCode)
  factory(module, module.exports, createExtensionRequire())

  const extension: Extension = module.exports.default || module.exports
  if (!extension.id || !extension.name) {
    throw new Error(`Extension at ${dirPath} is missing required "id" or "name" fields`)
  }

  extensionRegistry.register(extension, false)
  dirPathToExtensionId.set(dirPath, extension.id)
  console.log(`Loaded external extension: ${extension.name} (${extension.id})`)
}

/**
 * Load unpacked dev extensions from the given list of directory paths.
 * These are loaded directly from their source locations (no copy or symlink).
 */
export async function loadExtensionsFromDevPaths(devPaths: string[]): Promise<void> {
  for (const dirPath of devPaths) {
    await loadExtension(dirPath).catch(err =>
      console.error(`Failed to load dev extension from ${dirPath}:`, err)
    )
  }
}

/**
 * Load external extensions from the user's extensions directory.
 * Each extension is a directory containing manifest.json and a bundled index.js.
 * The bundle is expected to assign its default export to module.exports.
 */
export async function loadExternalExtensions(): Promise<void> {
  try {
    const extensionsDir = await window.electronAPI.getExtensionsDir()
    if (!extensionsDir) return

    const entries = await window.electronAPI.readDir(extensionsDir)
    if (!entries) return

    for (const entry of entries) {
      if (!entry.isDirectory) continue
      await loadExtension(entry.path).catch(err =>
        console.error(`Failed to load extension from ${entry.path}:`, err)
      )
    }
  } catch (err) {
    console.error('Failed to load external extensions:', err)
  }
}

/**
 * Create a require function for external extension bundles.
 *
 * Extensions declare these as externals during build, so they resolve to
 * host-provided modules.  The full host API is available as
 * `@conductor/extension-api` and individual subsystems (stores, ui, libs)
 * are also reachable via subpath requires.
 */
function createExtensionRequire() {
  const api = (window as any).__conductorAPI__

  const modules: Record<string, any> = {
    // React — shared instance so hooks work across host/extension boundary
    'react': api?.React,

    // Automatic JSX runtime — required by bundles built with jsx: 'automatic'
    'react/jsx-runtime': ReactJSXRuntime,
    'react/jsx-dev-runtime': ReactJSXRuntime,

    // Lucide icons — shared so extensions don't bundle their own copy
    'lucide-react': lucideReact,

    // Full host API
    '@conductor/extension-api': api,

    // SDK types (runtime: empty, extensions only need these at build time)
    '@conductor/extension-sdk': {},
  }

  return function extensionRequire(id: string) {
    if (modules[id]) return modules[id]
    throw new Error(`Extension require: module "${id}" not available from host.`)
  }
}
