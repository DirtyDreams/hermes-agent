import { api } from '../../lib/api'
import { useQueryClient } from '@tanstack/react-query'

export type TimelinePost = {
  id: string
  content: string
  visibility: string
  mediaUrls: string[]
  createdAt: string
  author: {
    id: string
    nickname: string | null
    displayName: string | null
    avatarUrl: string | null
  }
  reactionCounts: { like: number; love: number; wow: number }
  viewerReaction: 'LIKE' | 'LOVE' | 'WOW' | null
}

type Props = {
  post: TimelinePost
}

export default function PostCard({ post }: Props) {
  const queryClient = useQueryClient()
  const label = post.author.displayName || post.author.nickname || 'Member'

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['timeline'] })
    queryClient.invalidateQueries({ queryKey: ['profile-posts'] })
  }

  const toggleReaction = async (type: 'LIKE' | 'LOVE' | 'WOW') => {
    try {
      if (post.viewerReaction === type) {
        await api.delete(`/posts/${post.id}/reactions`)
      } else {
        await api.post(`/posts/${post.id}/reactions`, { type })
      }
      refresh()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <article
      className="rounded-3xl border border-white/10 bg-zinc-900/40 p-5 space-y-3"
      data-testid={`post-card-${post.id}`}
    >
      <div className="flex items-center gap-3">
        {post.author.avatarUrl ? (
          <img src={post.author.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-zinc-800" />
        )}
        <div>
          <p className="font-bold text-white">{label}</p>
          <p className="text-xs text-zinc-500">{new Date(post.createdAt).toLocaleString()}</p>
        </div>
        <span className="ml-auto text-xs uppercase text-zinc-500">{post.visibility}</span>
      </div>
      <p className="text-zinc-200 whitespace-pre-wrap">{post.content}</p>
      {post.mediaUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {post.mediaUrls.map((url) => (
            <img key={url} src={url} alt="" className="rounded-xl object-cover w-full max-h-48" />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
        {(['LIKE', 'LOVE', 'WOW'] as const).map((t) => {
          const key = t.toLowerCase() as keyof TimelinePost['reactionCounts']
          const count = post.reactionCounts[key]
          const active = post.viewerReaction === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggleReaction(t)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                active ? 'bg-primary text-primary-foreground' : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              {t} {count > 0 ? count : ''}
            </button>
          )
        })}
      </div>
    </article>
  )
}
