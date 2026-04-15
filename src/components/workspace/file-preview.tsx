// src/components/workspace/file-preview.tsx
import { useState, useEffect } from 'react'
import { useWorkspace } from '../../hooks/use-workspace'
import { X, Edit2, Save, Download, FileText, Image } from 'lucide-react'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'

type Props = {
  path: string
  onClose: () => void
}

export function FilePreview({ path, onClose }: Props) {
  const { readFile, writeFile } = useWorkspace()
  const [content, setContent] = useState('')
  const [mimeType, setMimeType] = useState('text/plain')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setEditing(false)
    void readFile(path).then((data) => {
      if (data) {
        setContent(data.content)
        setEditContent(data.content)
        setMimeType(data.mimeType)
      } else {
        setError('Failed to load file')
      }
      setLoading(false)
    })
  }, [path, readFile])

  const handleSave = async () => {
    setSaving(true)
    const ok = await writeFile(path, editContent)
    if (ok) {
      setContent(editContent)
      setEditing(false)
    } else {
      setError('Failed to save')
    }
    setSaving(false)
  }

  const isImage = mimeType.startsWith('image/')
  const isMarkdown = path.endsWith('.md')

  const handleDownload = () => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = path.split('/').pop() ?? 'file'
    a.click()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {isImage ? <Image className="h-4 w-4 flex-shrink-0 text-slate-400" /> : <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />}
          <span className="truncate text-sm font-medium text-white">{path.split('/').pop()}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button type="button" variant="ghost" size="sm" onClick={handleDownload} aria-label="Download file">
            <Download className="h-4 w-4" />
          </Button>
          {!isImage && (
            editing ? (
              <>
                <Button type="button" size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-500 border-emerald-500 text-slate-950 hover:bg-emerald-400">
                  <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setEditContent(content) }}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Edit2 className="h-4 w-4 mr-1" /> Edit
              </Button>
            )
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close preview">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading && <p className="text-sm text-slate-500">Loading...</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!loading && !error && isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:${mimeType};base64,${content}`}
            alt={path}
            className="max-w-full h-auto rounded-lg"
          />
        )}

        {!loading && !error && !isImage && editing && (
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-full h-full bg-slate-950/80 text-slate-100 font-mono text-sm"
          />
        )}

        {!loading && !error && !isImage && !editing && (
          isMarkdown ? (
            <div
              className="prose prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br>') }}
            />
          ) : (
            <pre className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">{content}</pre>
          )
        )}
      </div>
    </div>
  )
}
