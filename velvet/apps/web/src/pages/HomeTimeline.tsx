import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../lib/api'
import PostCard, { type TimelinePost } from '../components/posts/PostCard'
import ComposePost from '../components/posts/ComposePost'

export default function HomeTimeline() {
  const [composeOpen, setComposeOpen] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['timeline'],
    queryFn: async () => {
      const { data: res } = await api.get<{ data: TimelinePost[]; nextCursor: string | null }>(
        '/posts/timeline'
      )
      return res
    },
  })

  return (
    <div className="max-w-xl mx-auto space-y-6" data-testid="timeline-root">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Home</h1>
        <button type="button" className="btn btn-primary rounded-xl px-4 py-2" onClick={() => setComposeOpen((o) => !o)}>
          {composeOpen ? 'Close' : 'Compose'}
        </button>
      </div>

      {composeOpen && <ComposePost onClose={() => setComposeOpen(false)} />}

      {isLoading && <p className="text-zinc-500">Loading timeline…</p>}
      {error && <p className="text-red-400">Failed to load timeline</p>}
      {data?.data?.length === 0 && !isLoading && (
        <p className="text-zinc-500 text-center py-12">No posts yet. Write the first one.</p>
      )}
      <div className="space-y-4">
        {data?.data?.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  )
}
