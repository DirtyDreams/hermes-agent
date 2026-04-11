import { useState } from 'react'
import { api } from '../../lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { PostVisibility } from '@velvet/shared'

type Props = {
  onClose?: () => void
}

export default function ComposePost({ onClose }: Props) {
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<PostVisibility>('PUBLIC')
  const [files, setFiles] = useState<File[]>([])

  const submit = useMutation({
    mutationFn: async () => {
      const mediaKeys: string[] = []
      for (const file of files.slice(0, 4)) {
        const fileName = file.name || 'upload.bin'
        const { data: presign } = await api.post<{
          uploadUrl: string
          storageKey: string
        }>('/media/upload-url', {
          fileName,
          contentType: file.type || 'application/octet-stream',
          purpose: 'POST_MEDIA',
        })
        const put = await fetch(presign.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        })
        if (!put.ok) throw new Error('Upload failed')
        mediaKeys.push(presign.storageKey)
      }
      await api.post('/posts', {
        content,
        visibility,
        mediaKeys,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline'] })
      queryClient.invalidateQueries({ queryKey: ['profile-posts'] })
      setContent('')
      setFiles([])
      onClose?.()
    },
  })

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 space-y-3" data-testid="compose-post">
      <div className="flex gap-2 items-center">
        <label className="text-sm text-zinc-400">Visibility</label>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as PostVisibility)}
          className="bg-zinc-800 rounded-lg px-2 py-1 text-sm"
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
        className="w-full bg-zinc-950/80 rounded-xl p-3 text-sm border border-white/10"
      />
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 4))}
        className="text-sm text-zinc-400"
      />
      <button
        type="button"
        disabled={submit.isPending}
        onClick={() => submit.mutate()}
        className="btn btn-primary px-6 py-2 rounded-xl"
      >
        {submit.isPending ? 'Posting…' : 'Post'}
      </button>
      {submit.isError && (
        <p className="text-sm text-red-400">{(submit.error as Error).message}</p>
      )}
    </div>
  )
}
