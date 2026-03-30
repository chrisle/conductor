import { extensionRegistry } from './registry'
import type { Extension } from './types'
import * as lucideReact from 'lucide-react'

interface ExtensionManifest {
  id: string
  name: string
  version: string
  main: string
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

      try {
        const manifestPath = `${entry.path}/manifest.json`
        const manifestResult = await window.electronAPI.readFile(manifestPath)
        if (!manifestResult.success || !manifestResult.content) continue

        const manifest: ExtensionManifest = JSON.parse(manifestResult.content)
        const bundlePath = `${entry.path}/${manifest.main || 'index.js'}`
        const bundleResult = await window.electronAPI.readFile(bundlePath)
        if (!bundleResult.success || !bundleResult.content) continue

        const bundleCode = bundleResult.content

        // Execute the bundle in a sandboxed context
        // The bundle can access the host API via window.__conductorAPI__
        const module = { exports: {} as any }
        const wrappedCode = `(function(module, exports, require) {\n${bundleCode}\n})`
        const factory = eval(wrappedCode)
        factory(module, module.exports, createExtensionRequire())

        const extension: Extension = module.exports.default || module.exports
        if (!extension.id || !extension.name) {
          console.warn(`Extension at ${entry.path} missing id or name, skipping.`)
          continue
        }

        extensionRegistry.register(extension, false)
        console.log(`Loaded external extension: ${extension.name} (${extension.id})`)
      } catch (err) {
        console.error(`Failed to load extension from ${entry.path}:`, err)
      }
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
