import { useEffect, useMemo, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { ArrowRight } from 'lucide-react'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { Card } from './components/ui/card'
import { Input } from './components/ui/input'
import { Select } from './components/ui/select'
import { Textarea } from './components/ui/textarea'
import { ChatView } from './components/chat-view'
import { ToolActivityPanel } from './components/tool-activity-panel'
import { DashboardPanel } from './components/dashboard/dashboard-panel'
import { WorkspacePanel } from './components/workspace/workspace-panel'

type ChatSettings = {
  profile: string
  provider: string
  model: string
  toolsets: string
  skills: string
  maxTurns: number
  source: string
  timeoutMs: number
  resume: string
  continueName: string
  extraArgs: string
  yolo: boolean
  worktree: boolean
  passSessionId: boolean
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  meta?: string
}

type SessionOption = {
  id: string
  title: string
}

const defaultSettings: ChatSettings = {
  profile: '',
  provider: 'auto',
  model: '',
  toolsets: 'web,terminal',
  skills: '',
  maxTurns: 90,
  source: 'web-app',
  timeoutMs: 240000,
  resume: '',
  continueName: '',
  extraArgs: '',
  yolo: false,
  worktree: false,
  passSessionId: false,
}

function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'config'>('chat')
  const [settings, setSettings] = useState<ChatSettings>(defaultSettings)
  const [status, setStatus] = useState('Sprawdzanie Hermes CLI...')
  const [configText, setConfigText] = useState('')
  const [envText, setEnvText] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content:
        'Panel gotowy. Uzupełnij ustawienia po lewej i rozpocznij rozmowę z Hermesem.',
    },
  ])
  const [prompt, setPrompt] = useState('')
  const [sessionOptions, setSessionOptions] = useState<SessionOption[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [showEnvSecrets, setShowEnvSecrets] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isSavingConfig, setIsSavingConfig] = useState(false)

  useEffect(() => {
    void refreshStatus()
    void loadConfigFiles()
    void loadSessions()
  }, [])

  const canSend = useMemo(() => prompt.trim().length > 0 && !isSending, [prompt, isSending])

  const maskedEnv = envText
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim() || line.trim().startsWith('#') || !line.includes('=')) {
        return line
      }
      const [key, ...rest] = line.split('=')
      const value = rest.join('=')
      return `${key}=${'*'.repeat(Math.max(6, Math.min(24, value.trim().length)))}`
    })
    .join('\n')

  async function refreshStatus() {
    try {
      const response = await fetch('/api/system/status')
      const data = (await response.json()) as {
        hermesInstalled?: boolean
        version?: string
        configPath?: string
      }

      if (!response.ok || !data.hermesInstalled) {
        setStatus('Hermes CLI niewykryty. Sprawdź, czy `hermes` jest w PATH.')
        return
      }

      setStatus(`Hermes aktywny: ${data.version ?? 'unknown'} | config: ${data.configPath ?? '-'}`)
    } catch {
      setStatus('Błąd połączenia z backendem API.')
    }
  }

  async function loadConfigFiles() {
    try {
      const response = await fetch('/api/config/read')
      const data = (await response.json()) as { configText?: string; envText?: string }

      if (response.ok) {
        setConfigText(data.configText ?? '')
        setEnvText(data.envText ?? '')
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: 'Nie udało się załadować ~/.hermes/config.yaml lub ~/.hermes/.env.',
        },
      ])
    }
  }

  async function loadSessions() {
    try {
      const response = await fetch('/api/sessions/list')
      if (!response.ok) {
        return
      }
      const data = (await response.json()) as { sessions?: SessionOption[] }
      setSessionOptions(data.sessions ?? [])
    } catch {
      // ignore silently
    }
  }

  async function saveConfigFiles() {
    setIsSavingConfig(true)
    try {
      const response = await fetch('/api/config/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configText, envText }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error ?? 'Nieznany błąd zapisu konfiguracji.')
      }
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: 'Zapisano pliki Hermes: config.yaml i .env.',
        },
      ])
      void refreshStatus()
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: error instanceof Error ? error.message : 'Błąd zapisu konfiguracji Hermes.',
        },
      ])
    } finally {
      setIsSavingConfig(false)
    }
  }

  async function sendChatMessage() {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt || isSending) {
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedPrompt,
    }

    setPrompt('')
    setIsSending(true)
    setMessages((prev) => [...prev, userMessage])

    try {
      const response = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, message: trimmedPrompt }),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        output?: string
        error?: string
        result?: { exitCode: number | null; durationMs: number }
      }
      const output = payload.output?.trim() || payload.error || 'Brak odpowiedzi od Hermes CLI.'
      const meta = payload.result ? `exit=${payload.result.exitCode ?? 'null'} | ${payload.result.durationMs} ms` : undefined

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: payload.ok ? 'assistant' : 'system',
          content: output,
          meta,
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'system',
          content: 'Błąd sieci podczas wywołania /api/chat/send.',
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.24),_transparent_35%),linear-gradient(180deg,_#031b10_0%,_#071b11_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-emerald-600/30 bg-slate-950/80 p-6 shadow-card backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300/90">Hermes Agent</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Zarządzaj agentem w zielonym stylu</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                Wygodny pulpit do czatu, stanu sesji i konfiguracji Hermes CLI.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Badge className="bg-emerald-500 text-slate-950">Hermes CLI</Badge>
              <Badge className="bg-slate-800 text-slate-100">Dashboard</Badge>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-6">
            <Card className="rounded-[2rem] border-emerald-600/30 bg-slate-950/85 p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-emerald-500 text-slate-950">H</div>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Nawigacja</p>
                  <p className="text-lg font-semibold text-white">Panel boczny</p>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                <Button
                  variant={activeTab === 'chat' ? 'default' : 'ghost'}
                  className="w-full bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400"
                  onClick={() => setActiveTab('chat')}
                >
                  Czat
                </Button>
                <Button
                  variant={activeTab === 'config' ? 'default' : 'ghost'}
                  className="w-full bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400"
                  onClick={() => setActiveTab('config')}
                >
                  Konfiguracja
                </Button>
              </div>
            </Card>

            <Card className="rounded-[2rem] border-emerald-600/30 bg-slate-950/85 p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Stan systemu</p>
              <div className="mt-4 space-y-4">
                <div className="rounded-3xl bg-slate-900/80 p-4 text-slate-200 ring-1 ring-slate-800/70">
                  <p className="text-sm text-slate-400">Hermes</p>
                  <p className="mt-2 text-lg font-semibold text-white">{status}</p>
                </div>
                <div className="rounded-3xl bg-slate-900/80 p-4 text-slate-200 ring-1 ring-slate-800/70">
                  <p className="text-sm text-slate-400">Aktywna sesja</p>
                  <p className="mt-2 text-lg font-semibold text-white">{selectedSessionId || 'Brak'}</p>
                </div>
              </div>
            </Card>

            <Card className="rounded-[2rem] border-emerald-600/30 bg-slate-950/85 p-6">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Sesje</p>
              <div className="mt-4 space-y-4">
                <Select
                  value={selectedSessionId}
                  onChange={(event) => {
                    const selectedId = event.target.value
                    setSelectedSessionId(selectedId)
                    setSettings((prev) => ({ ...prev, resume: selectedId }))
                  }}
                  className="bg-slate-950/80 text-slate-100"
                >
                  <option value="">Wybierz sesję</option>
                  {sessionOptions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.title ? `${session.title} · ${session.id}` : session.id}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full bg-slate-800 text-slate-100 hover:bg-slate-700"
                  onClick={() => void loadSessions()}
                >
                  Odśwież sesje
                </Button>
              </div>
            </Card>
          </aside>

          <main className="space-y-6">
            <Card className="rounded-[2rem] border-emerald-600/30 bg-slate-950/85 p-8 shadow-xl">
              <div className="grid gap-8 lg:grid-cols-[1fr_300px] lg:items-center">
                <div className="space-y-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-300">Hermes Agent</p>
                  <h2 className="text-4xl font-semibold tracking-tight text-white">Szybki dostęp do czatu i konfiguracji</h2>
                  <p className="max-w-2xl text-sm leading-7 text-slate-300">
                    Zobacz stan, wybierz sesję i wyślij prompt do Hermesa bezpośrednio z pulpitu.
                  </p>
                </div>
                <div className="rounded-[2rem] bg-slate-900/90 p-6 ring-1 ring-slate-800/70">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Szybkie kroki</p>
                  <div className="mt-4 space-y-4 text-sm text-slate-200">
                    <div className="rounded-3xl bg-slate-950/70 p-4">Wybierz aktywną sesję</div>
                    <div className="rounded-3xl bg-slate-950/70 p-4">Napisz prompt</div>
                    <div className="rounded-3xl bg-slate-950/70 p-4">Kliknij Wyślij</div>
                  </div>
                </div>
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-[2rem] border-emerald-600/30 bg-slate-950/85 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-300">Sterowanie</p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Szybko wyślij prompt lub wyczyść historię rozmów.
                </p>
                <div className="mt-6 grid gap-3">
                  <Button
                    className="w-full bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400"
                    disabled={!canSend}
                    onClick={() => void sendChatMessage()}
                  >
                    {isSending ? 'Wysyłanie...' : 'Wyślij prompt'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full bg-slate-800 text-slate-100 hover:bg-slate-700"
                    onClick={() =>
                      setMessages([
                        {
                          id: 'welcome',
                          role: 'system',
                          content: 'Panel gotowy. Uzupełnij ustawienia po lewej i rozpocznij rozmowę z Hermesem.',
                        },
                      ])
                    }
                  >
                    Wyczyść czat
                  </Button>
                </div>
              </Card>

              <Card className="rounded-[2rem] border-emerald-600/30 bg-slate-950/85 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-300">Dane</p>
                <div className="mt-4 grid gap-3">
                  <Badge className="bg-emerald-500 text-slate-950">{messages.length} wiadomości</Badge>
                  <Badge className="bg-slate-800 text-slate-100">{sessionOptions.length} sesji</Badge>
                  <Badge className="bg-slate-800 text-slate-100">{status}</Badge>
                </div>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button
                    variant="secondary"
                    className="w-full sm:w-auto bg-slate-800 text-slate-100 hover:bg-slate-700"
                    onClick={() => void refreshStatus()}
                  >
                    Odśwież status
                  </Button>
                </div>
              </Card>
            </div>

            <Card className="rounded-[2rem] border-emerald-600/30 bg-slate-950/85 p-6">
              <Tabs.Root value={activeTab} onValueChange={(value) => setActiveTab(value as 'chat' | 'config')}>
                <Tabs.List className="mb-6 flex flex-wrap gap-2 rounded-3xl bg-slate-900/80 p-2 ring-1 ring-slate-800/90">
                  <Tabs.Trigger
                    value="chat"
                    className="rounded-3xl px-5 py-3 text-sm font-semibold transition data-[state=active]:bg-emerald-500 data-[state=active]:text-slate-950 data-[state=inactive]:bg-slate-950/40 data-[state=inactive]:text-slate-400 hover:data-[state=inactive]:bg-slate-900"
                  >
                    Czat
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="config"
                    className="rounded-3xl px-5 py-3 text-sm font-semibold transition data-[state=active]:bg-emerald-500 data-[state=active]:text-slate-950 data-[state=inactive]:bg-slate-950/40 data-[state=inactive]:text-slate-400 hover:data-[state=inactive]:bg-slate-900"
                  >
                    Konfiguracja
                  </Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content value="chat">
                  <Card className="rounded-[1.75rem] bg-slate-950/80 p-6 ring-1 ring-slate-800/70">
                    <ChatView />
                  </Card>
                </Tabs.Content>

                <Tabs.Content value="config">
                  <div className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
                    <section className="space-y-6">
                      <Card className="space-y-5 rounded-[2rem] border-emerald-600/30 bg-slate-950/85 p-6">
                        <div className="flex flex-col gap-2">
                          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-300">Konfiguracja Hermes</p>
                          <p className="text-sm text-slate-400">Edytuj config.yaml i .env w bezpiecznym trybie.</p>
                        </div>
                        <div className="space-y-4">
                          <label className="space-y-2 text-sm text-slate-300">
                            config.yaml
                            <Textarea
                              value={configText}
                              onChange={(event) => setConfigText(event.target.value)}
                              placeholder="Pełna konfiguracja YAML"
                              className="min-h-[220px] bg-slate-950/80 text-slate-100"
                            />
                          </label>
                          <label className="space-y-2 text-sm text-slate-300">
                            .env
                            <Textarea
                              value={showEnvSecrets ? envText : maskedEnv}
                              onChange={(event) => setEnvText(event.target.value)}
                              placeholder="Sekrety i tokeny"
                              className="min-h-[220px] bg-slate-950/80 text-slate-100"
                              readOnly={!showEnvSecrets}
                            />
                          </label>
                          <div className="flex flex-wrap gap-3">
                            <Button
                              variant="secondary"
                              className="bg-slate-800 text-slate-100 hover:bg-slate-700"
                              onClick={() => setShowEnvSecrets((prev) => !prev)}
                            >
                              {showEnvSecrets ? 'Ukryj sekrety' : 'Pokaż sekrety'}
                            </Button>
                            <Button
                              className="bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400"
                              disabled={isSavingConfig}
                              onClick={() => void saveConfigFiles()}
                            >
                              {isSavingConfig ? 'Zapisywanie...' : 'Zapisz konfigurację'}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    </section>

                    <aside className="space-y-6">
                      <Card className="space-y-5 rounded-[2rem] border-emerald-600/30 bg-slate-950/85 p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-300">Ustawienia uruchomienia</p>
                            <p className="text-sm text-slate-400">Parametry przekazywane do Hermes.</p>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="bg-slate-800 text-slate-100 hover:bg-slate-700"
                            onClick={() => void refreshStatus()}
                          >
                            Odśwież status
                          </Button>
                        </div>
                        <div className="space-y-4">
                          <label className="space-y-2 text-sm text-slate-300">
                            Provider
                            <Input
                              value={settings.provider}
                              onChange={(event) => setSettings((prev) => ({ ...prev, provider: event.target.value }))}
                              placeholder="auto | openrouter | nous..."
                              className="bg-slate-950/80 text-slate-100"
                            />
                          </label>
                          <label className="space-y-2 text-sm text-slate-300">
                            Model
                            <Input
                              value={settings.model}
                              onChange={(event) => setSettings((prev) => ({ ...prev, model: event.target.value }))}
                              placeholder="anthropic/claude-sonnet-4.6"
                              className="bg-slate-950/80 text-slate-100"
                            />
                          </label>
                          <label className="space-y-2 text-sm text-slate-300">
                            Toolsets
                            <Input
                              value={settings.toolsets}
                              onChange={(event) => setSettings((prev) => ({ ...prev, toolsets: event.target.value }))}
                              placeholder="web,terminal,skills"
                              className="bg-slate-950/80 text-slate-100"
                            />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-2 text-sm text-slate-300">
                              Max turns
                              <Input
                                type="number"
                                min={1}
                                value={settings.maxTurns}
                                onChange={(event) =>
                                  setSettings((prev) => ({ ...prev, maxTurns: Number(event.target.value) || 90 }))
                                }
                                className="bg-slate-950/80 text-slate-100"
                              />
                            </label>
                            <label className="space-y-2 text-sm text-slate-300">
                              Timeout (ms)
                              <Input
                                type="number"
                                min={1000}
                                value={settings.timeoutMs}
                                onChange={(event) =>
                                  setSettings((prev) => ({ ...prev, timeoutMs: Number(event.target.value) || 240000 }))
                                }
                                className="bg-slate-950/80 text-slate-100"
                              />
                            </label>
                          </div>
                        </div>
                      </Card>
                    </aside>
                  </div>
                </Tabs.Content>
              </Tabs.Root>
            </Card>
          </main>
        </div>
        <ToolActivityPanel />
        <DashboardPanel />
        <WorkspacePanel />
      </div>
    </div>
  )
}

export default App
