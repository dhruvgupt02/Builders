import { existsSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Dev only: serves the Vercel functions in /api from the Vite dev server, so `npm run dev` is enough
 * to test the AI routes locally. Production uses the Vercel runtime; this plugin is never part of the build.
 */
function devApi(): Plugin {
  return {
    name: 'brivio-dev-api',
    apply: 'serve',
    configureServer(server) {
      Object.assign(process.env, loadEnv('development', process.cwd(), ''))
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()
        const send = (status: number, data: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        }
        const file = `.${url.pathname}.ts`
        // Same rule as Vercel: anything starting with "_" is a helper, not a route.
        if (/\/_|\.\./.test(url.pathname) || !existsSync(file)) return send(404, { error: 'Not found' })
        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const raw = Buffer.concat(chunks).toString('utf8')
          const isJson = (req.headers['content-type'] ?? '').includes('application/json')
          const vReq = Object.assign(req, { body: isJson && raw ? JSON.parse(raw) : raw, query: Object.fromEntries(url.searchParams) })
          const vRes = Object.assign(res, {
            status(code: number) {
              res.statusCode = code
              return vRes
            },
            json(data: unknown) {
              send(res.statusCode, data)
              return vRes
            },
          })
          const mod = await server.ssrLoadModule(file)
          await mod.default(vReq, vRes)
        } catch (err) {
          console.error('[dev api]', err)
          if (!res.writableEnded) send(500, { error: 'Something went wrong. Please try again.' })
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
})
