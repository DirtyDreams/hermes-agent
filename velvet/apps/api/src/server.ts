import 'dotenv/config'
import { buildApp } from './app.js'
import { setupSocketIO } from './lib/socket.js'

const app = buildApp()

const start = async () => {
  try {
    await setupSocketIO(app)
    const port = Number(process.env.PORT) || 3000
    await app.listen({ port, host: '0.0.0.0' })
    console.log(`API running on port ${port}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
