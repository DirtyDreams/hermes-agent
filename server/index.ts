import cors from 'cors'
import express, { type Request, type Response } from 'express'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'

type ChatRequest = {
  message: string
  profile?: string
  provider?: string
  model?: string
  toolsets?: string
  skills?: string
  maxTurns?: number
  yolo?: boolean
  worktree?: boolean
  passSessionId?: boolean
  resume?: string
  continueName?: string
  source?: string
  extraArgs?: string
  timeoutMs?: number
}

type CommandResult = {
  command: string
  args: string[]
  stdout: string
  stderr: string
  exitCode: number | null
  durationMs: number
}

const app = express()
const port = Number(process.env.PORT ?? 8787)

app.use(cors())
app.use(express.json({ limit: '1mb' }))

const getHermesHome = () => process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')

async function runCommand(
  command: string,
  args: string[],
  timeoutMs = 240_000,
): Promise<CommandResult> {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    })

    let stdout = ''
    let stderr = ''
    let killedByTimeout = false

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    const timeout = setTimeout(() => {
      killedByTimeout = true
      child.kill('SIGTERM')
    }, timeoutMs)

    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.on('close', (exitCode) => {
      clearTimeout(timeout)
      const durationMs = Date.now() - startedAt
      const timeoutMessage = killedByTimeout
        ? `\n[Hermes process timeout after ${timeoutMs}ms]`
        : ''

      resolve({
        command,
        args,
        stdout,
        stderr: `${stderr}${timeoutMessage}`,
        exitCode,
        durationMs,
      })
    })
  })
}

function parseExtraArgs(raw: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i]

    if (quote) {
      if (char === quote) {
        quote = null
      } else if (char === '\\' && i + 1 < raw.length) {
        current += raw[i + 1]
        i += 1
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current) {
    args.push(current)
  }

  return args
}

function buildHermesArgs(input: ChatRequest): string[] {
  const args: string[] = []

  if (input.profile) {
    args.push('--profile', input.profile)
  }

  args.push('chat', '--quiet', '-q', input.message)

  if (input.provider) {
    args.push('--provider', input.provider)
  }

  if (input.model) {
    args.push('--model', input.model)
  }

  if (input.toolsets) {
    args.push('--toolsets', input.toolsets)
  }

  if (input.skills) {
    args.push('--skills', input.skills)
  }

  if (typeof input.maxTurns === 'number' && Number.isFinite(input.maxTurns)) {
    args.push('--max-turns', String(input.maxTurns))
  }

  if (input.resume) {
    args.push('--resume', input.resume)
  }

  if (input.continueName) {
    args.push('--continue', input.continueName)
  }

  if (input.source) {
    args.push('--source', input.source)
  }

  if (input.yolo) {
    args.push('--yolo')
  }

  if (input.worktree) {
    args.push('--worktree')
  }

  if (input.passSessionId) {
    args.push('--pass-session-id')
  }

  if (input.extraArgs?.trim()) {
    args.push(...parseExtraArgs(input.extraArgs.trim()))
  }

  return args
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'hermes-app-api' })
})

app.get('/api/system/status', async (_req: Request, res: Response) => {
  try {
    const [versionResult, configPathResult, envPathResult] = await Promise.all([
      runCommand('hermes', ['--version'], 20_000),
      runCommand('hermes', ['config', 'path'], 20_000),
      runCommand('hermes', ['config', 'env-path'], 20_000),
    ])

    res.json({
      hermesInstalled: versionResult.exitCode === 0,
      version: versionResult.stdout.trim(),
      configPath: configPathResult.stdout.trim(),
      envPath: envPathResult.stdout.trim(),
      details: {
        versionResult,
        configPathResult,
        envPathResult,
      },
    })
  } catch (error) {
    res.status(500).json({
      hermesInstalled: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to check Hermes installation status.',
    })
  }
})

function parseHermesSessions(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^(-+|ID\b|Session\b|\[|\*\*)/i.test(line))
    .map((line) => {
      const parts = line.split(/\s+/)
      const id = parts.shift() ?? ''
      const title = parts.join(' ')
      return { id, title }
    })
}

app.get('/api/sessions/list', async (_req: Request, res: Response) => {
  try {
    const result = await runCommand('hermes', ['sessions', 'list'], 15_000)

    if (result.exitCode !== 0) {
      res.status(500).json({ error: result.stderr.trim() || 'Nie udało się pobrać listy sesji.' })
      return
    }

    res.json({ sessions: parseHermesSessions(result.stdout) })
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Nie udało się pobrać listy sesji Hermes.',
    })
  }
})

app.get('/api/config/read', async (_req: Request, res: Response) => {
  try {
    const hermesHome = getHermesHome()
    const configPath = path.join(hermesHome, 'config.yaml')
    const envPath = path.join(hermesHome, '.env')

    const [configText, envText] = await Promise.all([
      fs.readFile(configPath, 'utf8').catch(() => ''),
      fs.readFile(envPath, 'utf8').catch(() => ''),
    ])

    res.json({
      hermesHome,
      configPath,
      envPath,
      configText,
      envText,
    })
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Failed to read Hermes configuration files.',
    })
  }
})

app.post('/api/config/write', async (req: Request, res: Response) => {
  const payload = req.body as { configText?: string; envText?: string }

  try {
    const hermesHome = getHermesHome()
    const configPath = path.join(hermesHome, 'config.yaml')
    const envPath = path.join(hermesHome, '.env')

    await fs.mkdir(hermesHome, { recursive: true })

    if (typeof payload.configText === 'string') {
      await fs.writeFile(configPath, payload.configText, 'utf8')
    }

    if (typeof payload.envText === 'string') {
      await fs.writeFile(envPath, payload.envText, 'utf8')
    }

    res.json({ ok: true, configPath, envPath })
  } catch (error) {
    res.status(500).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to write Hermes configuration files.',
    })
  }
})

app.post('/api/chat/send', async (req: Request, res: Response) => {
  const payload = req.body as ChatRequest

  if (!payload?.message || typeof payload.message !== 'string') {
    res.status(400).json({ error: 'Field "message" is required.' })
    return
  }

  try {
    const args = buildHermesArgs(payload)
    const result = await runCommand('hermes', args, payload.timeoutMs ?? 240_000)

    res.status(result.exitCode === 0 ? 200 : 500).json({
      ok: result.exitCode === 0,
      result,
      output: result.stdout.trim() || result.stderr.trim(),
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Hermes command failed unexpectedly.',
    })
  }
})

app.get('/api/skills/list', async (_req: Request, res: Response) => {
  try {
    const result = await runCommand('hermes', ['skills', 'list', '--json'], 30_000)
    if (result.exitCode !== 0) {
      res.json({ skills: [], error: result.stderr.trim() })
      return
    }
    let skills: unknown[] = []
    try { skills = JSON.parse(result.stdout) } catch { /* Hermes returned non-JSON — return empty */ }
    res.json({ skills })
  } catch (error) {
    res.status(500).json({ skills: [], error: String(error) })
  }
})

app.get('/api/mcp/tools', async (_req: Request, res: Response) => {
  try {
    const result = await runCommand('hermes', ['mcp', 'list', '--json'], 30_000)
    if (result.exitCode !== 0) {
      res.json({ servers: [], error: result.stderr.trim() })
      return
    }
    let servers: unknown[] = []
    try { servers = JSON.parse(result.stdout) } catch { /* Hermes returned non-JSON — return empty */ }
    res.json({ servers })
  } catch (error) {
    res.status(500).json({ servers: [], error: String(error) })
  }
})

app.get('/api/providers/list', async (_req: Request, res: Response) => {
  try {
    const result = await runCommand('hermes', ['providers', 'list', '--json'], 20_000)
    if (result.exitCode !== 0) {
      res.json({ providers: [], error: result.stderr.trim() })
      return
    }
    let providers: unknown[] = []
    try { providers = JSON.parse(result.stdout) } catch { /* Hermes returned non-JSON — return empty */ }
    res.json({ providers })
  } catch (error) {
    // Fallback: try to parse from config
    res.json({ providers: [], error: String(error) })
  }
})

app.get('/api/jobs/list', async (_req: Request, res: Response) => {
  try {
    const result = await runCommand('hermes', ['jobs', 'list', '--json'], 30_000)
    if (result.exitCode !== 0) {
      res.status(500).json({ jobs: [], error: result.stderr.trim() })
      return
    }
    let jobs: unknown[] = []
    try { jobs = JSON.parse(result.stdout) } catch { /* Hermes returned non-JSON — return empty */ }
    res.json({ jobs })
  } catch (error) {
    res.status(500).json({ jobs: [], error: String(error) })
  }
})

app.post('/api/jobs/cancel/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const result = await runCommand('hermes', ['jobs', 'cancel', id], 20_000)
    res.status(result.exitCode === 0 ? 200 : 500).json({ ok: result.exitCode === 0, error: result.stderr.trim() })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) })
  }
})

app.get('/api/system/health', async (_req: Request, res: Response) => {
  try {
    const [versionResult, memoryResult] = await Promise.all([
      runCommand('hermes', ['--version'], 10_000).catch(() => ({ stdout: '', stderr: '', exitCode: 1 })),
      runCommand('hermes', ['system', 'info', '--json'], 20_000).catch(() => ({ stdout: '', stderr: '', exitCode: 1 })),
    ])

    let healthData: { memory: null; uptime: null; activeModel: null } | Record<string, unknown> = { memory: null, uptime: null, activeModel: null }

    res.json({
      hermesInstalled: versionResult.exitCode === 0,
      version: versionResult.stdout.trim(),
      ...healthData,
    })
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

// Tool event emitter for cross-endpoint communication
const toolEmitter = new EventEmitter()

app.post('/api/chat/stream', async (req: Request, res: Response) => {
  const payload = req.body as ChatRequest

  if (!payload?.message || typeof payload.message !== 'string') {
    res.status(400).json({ error: 'Field "message" is required.' })
    return
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const args = buildHermesArgs(payload)
  const startedAt = Date.now()

  const child = spawn('hermes', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  })

  let stdout = ''
  let stderr = ''

  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    stdout += text
    res.write(`data: ${JSON.stringify({ type: 'token', data: text })}\n\n`)
  })

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    stderr += text
    try {
      const parsed = JSON.parse(text)
      if (parsed.type === 'tool_call') {
        res.write(`data: ${JSON.stringify({ type: 'tool_call', data: parsed })}\n\n`)
        toolEmitter.emit('tool_call', parsed)
      } else if (parsed.type === 'tool_result') {
        res.write(`data: ${JSON.stringify({ type: 'tool_result', data: parsed })}\n\n`)
        toolEmitter.emit('tool_result', parsed)
      }
    } catch {
      res.write(`data: ${JSON.stringify({ type: 'token', data: text })}\n\n`)
    }
  })

  const timeout = setTimeout(() => {
    child.kill('SIGTERM')
    res.write(`data: ${JSON.stringify({ type: 'error', data: 'Timeout' })}\n\n`)
    res.end()
  }, payload.timeoutMs ?? 240_000)

  child.on('close', (exitCode) => {
    clearTimeout(timeout)
    const durationMs = Date.now() - startedAt
    res.write(`data: ${JSON.stringify({ type: 'done', data: { exitCode, durationMs } })}\n\n`)
    res.end()
  })

  child.on('error', (error) => {
    clearTimeout(timeout)
    res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`)
    res.end()
  })

  req.on('close', () => {
    clearTimeout(timeout)
    child.kill('SIGTERM')
  })
})

// SSE endpoint for tool events
app.get('/api/chat/tool-events', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const onToolCall = (data: unknown) => {
    res.write(`data: ${JSON.stringify({ type: 'tool_call', data })}\n\n`)
  }
  const onToolResult = (data: unknown) => {
    res.write(`data: ${JSON.stringify({ type: 'tool_result', data })}\n\n`)
  }

  toolEmitter.on('tool_call', onToolCall)
  toolEmitter.on('tool_result', onToolResult)

  _req.on('close', () => {
    toolEmitter.off('tool_call', onToolCall)
    toolEmitter.off('tool_result', onToolResult)
  })
})

app.listen(port, () => {
  console.log(`[hermes-app-api] running on http://localhost:${port}`)
})
