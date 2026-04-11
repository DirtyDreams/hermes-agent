import { api } from '../../lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export type TimelinePost = {
  id: string
  content: string
  visibility: string
  mediaUrls: string[]
  author: {
    id: string
    displayName: string | null
    nickname: string | null
    avatarUrl: string | null
  }
  reactionCounts: Record<string, number>
  viewerReaction: string | null
}

const REACTIONS = ['LIKE', 'LOVE', 'WOW'] as const

export default function PostCard({ post }: { post: TimelinePost }) {
  const queryClient = useQueryClient()
  const label = post.author.displayName || post.author.nickname || 'Member'

  const react = useMutation({
    mutationFn: async (type: (typeof REACTIONS)[number]) => {
      if (post.viewerReaction === type) {
        await api.delete(`/posts/${post.id}/reactions`)
      } else {
        await api.post(`/posts/${post.id}/reactions`, { type })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline'] })
      queryClient.invalidateQueries({ queryKey: ['profile-posts'] })
    },
  })

  return (
    <article
      className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4 space-y-3"
      data-testid={`post-card-${post.id}`}
    >
      <div className="flex items-center gap-3">
        {post.author.avatarUrl ? (
          <img src={post.author.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-zinc-800" />
        )}
        <div>
          <div className="font-semibold">{label}</div>
          <div className="text-xs text-zinc-500">{post.visibility}</div>
        </div>
      </div>
      <p className="text-zinc-200 whitespace-pre-wrap">{post.content}</p>
      {post.mediaUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {post.mediaUrls.map((url) => (
            <img key={url} src={url} alt="" className="rounded-xl w-full object-cover max-h-64" />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-2">
        {REACTIONS.map((r) => (
          <button
            key={r}
            type="button"
            disabled={react.isPending}
            onClick={() => react.mutate(r)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              post.viewerReaction === r
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-white/15 text-zinc-400 hover:text-white'
            }`}
          >
            {r} {post.reactionCounts[r] ? `(${post.reactionCounts[r]})` : ''}
          </button>
        ))}
      </div>
    </article>
  )
}
