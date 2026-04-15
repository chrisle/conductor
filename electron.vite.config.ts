import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const appVersion = JSON.parse(readFileSync(resolve('package.json'), 'utf-8')).version

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/main/index.ts')
      }
    },
    resolve: {
      alias: {
        '@': resolve('src')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('electron/preload/index.ts')
      }
    }
  },
  renderer: {
    clearScreen: false,
    root: '.',
    publicDir: 'public',
    server: {
      // Disable HMR and file watching so saving a file in the editor doesn't
      // reload the renderer and blow away terminal/tab state. Refresh with
      // Ctrl+R (or restart the dev server) to pick up changes.
      hmr: false,
      watch: null,
      fs: {
        allow: ['..']
      }
    },
    build: {
      rollupOptions: {
        input: resolve('index.html')
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src'),
        '@': resolve('src'),
        '@conductor/extension-sdk': resolve('../conductor-extension-sdk/src/index.ts')
      }
    },
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    }
  }
})
