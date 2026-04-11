import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'

type Visibility = 'PUBLIC' | 'UNLOCKED_ONLY' | 'DRAFT'

type Props = {
  onClose?: () => void
}

export default function ComposePost({ onClose }: Props) {
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadMediaKeys = async (): Promise<string[]> => {
    const keys: string[] = []
    for (const file of files.slice(0, 4)) {
      const { data } = await api.post<{ uploadUrl: string; storageKey: string }>('/media/upload-url', {
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        purpose: 'POST_MEDIA',
      })
      await fetch(data.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
      keys.push(data.storageKey)
    }
    return keys
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const mediaKeys = files.length > 0 ? await uploadMediaKeys() : []
      await api.post('/posts', { content, visibility, mediaKeys })
      setContent('')
      setFiles([])
      await queryClient.invalidateQueries({ queryKey: ['timeline'] })
      await queryClient.invalidateQueries({ queryKey: ['profile-posts'] })
      onClose?.()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err && err.response && typeof err.response === 'object' && 'data' in err.response
        ? JSON.stringify((err.response as { data?: unknown }).data)
        : 'Failed to post'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border border-white/10 bg-zinc-900/60 p-5" data-testid="compose-post">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-lg">New post</h3>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as Visibility)}
          className="bg-zinc-800 rounded-lg px-3 py-2 text-sm"
          data-testid="compose-visibility"
        >
          <option value="PUBLIC">Public</option>
          <option value="UNLOCKED_ONLY">Unlocked only</option>
          <option value="DRAFT">Draft</option>
        </select>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="What's on your mind?"
        rows={4}
        maxLength={8000}
        className="w-full rounded-xl bg-zinc-950 border border-white/10 p-3 text-sm"
        data-testid="compose-content"
      />
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 4))}
        data-testid="compose-files"
      />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary w-full rounded-xl py-3 font-bold"
        data-testid="compose-submit"
      >
        {submitting ? 'Posting…' : 'Post'}
      </button>
    </form>
  )
}
