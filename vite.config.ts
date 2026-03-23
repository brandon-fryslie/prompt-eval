import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'

// [LAW:one-source-of-truth] SRI hashes are derived from the actual built asset content
function sriPlugin(): Plugin {
  return {
    name: 'vite-plugin-sri',
    enforce: 'post',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle
        if (!bundle) return html

        // Build a map from asset file names to their SRI hashes
        const hashMap = new Map<string, string>()
        for (const [fileName, chunk] of Object.entries(bundle)) {
          const content = chunk.type === 'chunk' ? chunk.code : chunk.source
          const hash = createHash('sha384')
            .update(typeof content === 'string' ? content : Buffer.from(content))
            .digest('base64')
          hashMap.set(fileName, `sha384-${hash}`)
        }

        // Add integrity attributes to script and link tags
        // [LAW:single-enforcer] All SRI enforcement happens here, in one place
        const addIntegrity = (tag: string, url: string): string => {
          const assetPath = url.replace(/^\/prompt-eval\//, '')
          const integrity = hashMap.get(assetPath)
          if (!integrity) return tag
          // Remove any existing crossorigin attribute to avoid duplicates
          const cleaned = tag.replace(/\s+crossorigin(?:="[^"]*")?/g, '')
          // Insert integrity and crossorigin before the closing > or />
          return cleaned.replace(/\/?\s*>$/, ` integrity="${integrity}" crossorigin="anonymous">`)
        }

        return html
          .replace(
            /<script[^>]*\ssrc="([^"]*)"[^>]*>/g,
            (match, src) => addIntegrity(match, src),
          )
          .replace(
            /<link[^>]*\shref="([^"]*)"[^>]*?\/?>/g,
            (match, href) => addIntegrity(match, href),
          )
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sriPlugin()],
  base: '/prompt-eval/',
})
