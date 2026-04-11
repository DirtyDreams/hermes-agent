import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import PostCard, { type TimelinePost } from '../components/posts/PostCard'
import ComposePost from '../components/posts/ComposePost'
import { useState } from 'react'

export default function HomeTimeline() {
  const [showCompose, setShowCompose] = useState(true)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['timeline'],
    queryFn: async () => {
      const { data } = await api.get<{ data: TimelinePost[]; nextCursor?: string }>('/posts/timeline')
      return data
    },
  })

  if (isLoading) {
    return <div className="text-center py-20 text-zinc-500">Loading timeline…</div>
  }

  const posts = data?.data ?? []

  return (
    <div className="max-w-lg mx-auto space-y-6" data-testid="timeline-root">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-black">Home</h1>
        <button type="button" className="text-sm text-primary font-bold" onClick={() => setShowCompose((s) => !s)}>
          {showCompose ? 'Hide composer' : 'Compose'}
        </button>
      </div>
      {showCompose && <ComposePost />}
      <div className="space-y-4">
        {posts.length === 0 ? (
          <p className="text-center text-zinc-500 py-12">No posts yet. Say hello!</p>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>
      {data?.nextCursor && (
        <button type="button" className="w-full py-2 text-sm text-zinc-400" onClick={() => refetch()}>
          Load more (refresh)
        </button>
      )}
    </div>
  )
}
