# Feed, posts, and reactions — implementation plan

> **For agentic workers:** Use **subagent-driven-development** or **executing-plans** to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement posts with `POST_MEDIA` attachments, per-post visibility (`PUBLIC` | `UNLOCKED_ONLY` | `DRAFT`), profile wall + home timeline APIs, reactions, and minimal web UI per [spec](../specs/2026-04-11-feed-posts-design.md).

**Architecture:** New `posts` Fastify module under `/api/v1/posts`; wall list exposed as `GET /api/v1/profiles/:id/posts` (delegates to shared service). Prisma gains `visibility` and drops `isPublic`. Timeline uses a pull query: own posts (any visibility) ∪ `PUBLIC` ∪ `UNLOCKED_ONLY` where the viewer has `ProfileUnlock` on any **wall profile** the post belongs to. DTOs include `mediaUrls` from `getPublicUrl(key)`.

**Tech stack:** Fastify, Prisma, PostgreSQL, Zod in `@velvet/shared`, Vitest `app.inject`, React + TanStack Query + Vite, Playwright.

---

## File map

| Path | Role |
|------|------|
| `velvet/apps/api/prisma/schema.prisma` | `Post.visibility`, remove `isPublic`; `PostReaction` → `onDelete: Cascade` on `Post` |
| `velvet/apps/api/prisma/migrations/*` | New migration (map old `isPublic` if rows exist) |
| `velvet/packages/shared/src/schemas/post.ts` | `PostVisibility`, `ReactionType`, `CreatePostSchema`, `UpdatePostSchema`, `PostReactionBodySchema` |
| `velvet/packages/shared/src/index.ts` | `export * from './schemas/post'` |
| `velvet/apps/api/src/modules/posts/posts.service.ts` | CRUD, visibility checks, timeline + wall queries, `toPostDto` |
| `velvet/apps/api/src/modules/posts/posts.routes.ts` | REST handlers + route-level `rateLimit` where needed |
| `velvet/apps/api/src/app.ts` | `app.register(...posts..., { prefix: '/api/v1/posts' })` |
| `velvet/apps/api/src/modules/profiles/profiles.routes.ts` | `GET /:id/posts` before `GET /:id`; remove stray comment at top if still present |
| `velvet/apps/api/src/__tests__/posts.test.ts` | API tests |
| `velvet/apps/web/src/pages/DiscoveryFeed.tsx` | Move current `Feed.tsx` card stack here (rename file + default export) |
| `velvet/apps/web/src/pages/Feed.tsx` | Replace with thin re-export or delete after rename — **prefer:** rename `Feed.tsx` → `DiscoveryFeed.tsx`, add new `HomeTimeline.tsx` as index route |
| `velvet/apps/web/src/pages/HomeTimeline.tsx` | Timeline list + compose entry |
| `velvet/apps/web/src/components/posts/PostCard.tsx` | Single post UI + reactions |
| `velvet/apps/web/src/components/posts/ComposePost.tsx` | Visibility, text, presigned uploads, `POST /posts` |
| `velvet/apps/web/src/App.tsx` | `index` → `HomeTimeline`, `path="discovery"` → `DiscoveryFeed`; fix imports |
| `velvet/apps/web/src/components/Layout.tsx` | Nav: Home vs Discovery labels/links |
| `velvet/apps/web/src/pages/ProfileView.tsx` | `WALL` tab: `GET /profiles/:id/posts` |
| `velvet/apps/web/e2e/critical-path.spec.ts` | Use `/profiles/me` API to resolve profile id, then `/profile/:id`; optional timeline smoke |

---

## Constants (use everywhere)

- `MAX_POST_CONTENT_LENGTH = 8000`
- `MAX_POST_MEDIA = 4`
- Media key prefix: `` `POST_MEDIA/${userId}/` `` (must match `media.routes.ts` storage key pattern for `purpose === 'POST_MEDIA'`)

---

### Task 1: Prisma schema and migration

**Files:**
- Modify: `velvet/apps/api/prisma/schema.prisma`
- Create: `velvet/apps/api/prisma/migrations/<timestamp>_post_visibility/migration.sql` (via CLI)

**Steps:**

- [ ] **Step 1: Edit `Post` model**

Replace `isPublic Boolean @default(true)` with:

```prisma
visibility String @default("PUBLIC") // PUBLIC | UNLOCKED_ONLY | DRAFT
```

- [ ] **Step 2: Fix `PostReaction` relation**

Ensure the post side cascades deletes:

```prisma
post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
```

- [ ] **Step 3: Create migration**

Run from `velvet/apps/api`:

```bash
npx prisma migrate dev --name post_visibility
```

If existing rows exist, edit the generated SQL to map `isPublic`:

```sql
-- Example if column rename: add visibility, backfill, drop isPublic
UPDATE "Post" SET "visibility" = CASE WHEN "isPublic" = true THEN 'PUBLIC' ELSE 'UNLOCKED_ONLY' END;
```

(Adjust to match your generated migration; if `Post` is empty, a simple `DROP COLUMN "isPublic"` + `ADD COLUMN "visibility"` is fine.)

- [ ] **Step 4: Regenerate client**

```bash
npx prisma generate
```

Expected: succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add velvet/apps/api/prisma
git commit -m "feat(api): add Post.visibility and cascade delete reactions"
```

---

### Task 2: Shared Zod schemas

**Files:**
- Create: `velvet/packages/shared/src/schemas/post.ts`
- Modify: `velvet/packages/shared/src/index.ts`

- [ ] **Step 1: Add `velvet/packages/shared/src/schemas/post.ts`**

```typescript
import { z } from 'zod'

export const PostVisibility = z.enum(['PUBLIC', 'UNLOCKED_ONLY', 'DRAFT'])
export type PostVisibility = z.infer<typeof PostVisibility>

export const ReactionType = z.enum(['LIKE', 'LOVE', 'WOW'])
export type ReactionType = z.infer<typeof ReactionType>

export const CreatePostSchema = z.object({
  content: z.string().max(8000),
  visibility: PostVisibility,
  mediaKeys: z.array(z.string()).max(4).optional().default([]),
})

export const UpdatePostSchema = z.object({
  content: z.string().max(8000).optional(),
  visibility: PostVisibility.optional(),
  mediaKeys: z.array(z.string()).max(4).optional(),
})

export const PostReactionBodySchema = z.object({
  type: ReactionType,
})

export function assertNonEmptyPost(content: string, mediaKeys: string[]) {
  const text = content.trim()
  if (text.length === 0 && mediaKeys.length === 0) {
    throw new Error('Post must have text or at least one media attachment')
  }
}
```

- [ ] **Step 2: Export from package**

In `index.ts`:

```typescript
export * from './schemas/post'
```

- [ ] **Step 3: Commit**

```bash
git add velvet/packages/shared
git commit -m "feat(shared): add post and reaction Zod schemas"
```

---

### Task 3: Posts service (core logic)

**Files:**
- Create: `velvet/apps/api/src/modules/posts/posts.service.ts`

- [ ] **Step 1: Write failing test first (TDD)** — skip if you batch tests in Task 6; otherwise add one test in `posts.test.ts` for `POST /posts` 401 without auth, run, see FAIL.

- [ ] **Step 2: Implement `posts.service.ts`**

Responsibilities (signatures illustrative — implement with Prisma types from your client):

1. **`validateMediaKeys(authorId: string, keys: string[])`**  
   - `keys.length <= 4`  
   - Every key starts with `POST_MEDIA/${authorId}/`

2. **`getUnlockedProfileIds(viewerId: string)`** — `db.profileUnlock.findMany({ where: { userId: viewerId }, select: { targetId: true } })` → `Set<string>`.

3. **`timelineWhereForViewer(viewerId: string, unlocked: Set<string>): Prisma.PostWhereInput`**  
   - `OR`:  
     - `{ authorId: viewerId }`  
     - `{ visibility: 'PUBLIC' }`  
     - `{ AND: [{ visibility: 'UNLOCKED_ONLY' }, { OR: [ /* wall match */ ] }] }`  
   - **Wall match for `UNLOCKED_ONLY`:** post is visible if **any** of these `targetId`s is in `unlocked`:  
     - `author.profile.id` (author’s individual profile; include only if `author.profile` exists)  
     - `author.coupleAsP1.profileId` (if non-null)  
     - `author.coupleAsP2.profileId` (if non-null)  
   Use Prisma nested filters, e.g.:

```typescript
{
  AND: [
    { visibility: 'UNLOCKED_ONLY' },
    {
      OR: [
        { author: { profile: { id: { in: [...unlocked] } } } },
        { author: { coupleAsP1: { profileId: { in: [...unlocked] } } } },
        { author: { coupleAsP2: { profileId: { in: [...unlocked] } } } },
      ],
    },
  ],
}
```

(Filter out undefined `in: []` branches if the set is empty — empty `in` should yield no matches for that branch.)

4. **`createPost(userId, input)`** — parse with `CreatePostSchema`, run `assertNonEmptyPost`, `validateMediaKeys`, `db.post.create`.

5. **`updatePost(userId, postId, input)`** — author check; `UpdatePostSchema` partial; re-validate media keys if provided; merge `content`/`visibility`/`mediaKeys`.

6. **`deletePost(userId, postId)`** — author-only; `db.post.delete`.

7. **`listTimeline(viewerId, { cursor, limit })`** — keyset pagination on `(createdAt desc, id desc)`; `where: timelineWhereForViewer`; `include: { author: { include: { profile: true, coupleAsP1: true, coupleAsP2: true } }, reactions: true }` (trim if heavy).

8. **`listPostsForProfile(profileId, viewerId, { cursor, limit })`**  
   - Load `Profile` by id; 404 if missing.  
   - **Wall membership `where`:**  
     - If `profile.userId` set: `{ authorId: profile.userId }`.  
     - Else resolve `Couple` where `profileId === profileId`; if found: `{ authorId: { in: [couple.partner1Id, couple.partner2Id].filter(Boolean) } }`; else 404 or empty.  
   - **Visibility filter per post (same as single-read):** reuse a shared function `canViewerReadPost(post, viewerId, unlockedSet)` implementing spec §5 (draft = author only; public = any auth user; unlocked-only = author or unlock on wall profile id for that post).  
   - For wall, **wall profile id** is always the requested `profileId`.

9. **`setReaction(viewerId, postId, type)`** — verify post readable with `canViewerReadPost`; `db.postReaction.upsert` with `@@unique([postId, userId])`.

10. **`removeReaction(viewerId, postId)`** — `deleteMany` where postId + userId.

11. **`toPostDto(post, viewerId)`** — map `mediaKeys` → `mediaUrls` via `getPublicUrl` from `../../lib/storage.js`; include reaction aggregates + `viewerReaction` (current user’s type or null).

Import `getPublicUrl` from `../../lib/storage.js`.

- [ ] **Step 3: Commit**

```bash
git add velvet/apps/api/src/modules/posts/posts.service.ts
git commit -m "feat(api): add posts service with timeline and wall queries"
```

---

### Task 4: Posts routes + app registration

**Files:**
- Create: `velvet/apps/api/src/modules/posts/posts.routes.ts`
- Modify: `velvet/apps/api/src/app.ts`

- [ ] **Step 1: Implement `posts.routes.ts`**

Register with `onRequest: [app.authenticate]` for all routes.

| Method | Path | Handler |
|--------|------|---------|
| POST | `/` | `createPost` |
| PATCH | `/:id` | `updatePost` |
| DELETE | `/:id` | `deletePost` |
| GET | `/timeline` | query `cursor`, `limit` (default 20, max 50) |

Use `fastify-rate-limit` **per-route** for `POST /`, `PATCH /:id`, `POST /:id/reactions` (e.g. `max: 30`, `timeWindow: '1 minute'`) — mirror how global limit is registered in `app.ts` (check `@fastify/rate-limit` route config).

Add reaction routes:

- `POST /:id/reactions` — body `PostReactionBodySchema`
- `DELETE /:id/reactions` — no body

Return `{ data: ... }` or plain JSON consistent with nearby modules (`profiles` uses mixed styles — **pick one** and match `discovery` for new code).

- [ ] **Step 2: Register in `app.ts`**

```typescript
app.register(import('./modules/posts/posts.routes.js'), { prefix: '/api/v1/posts' })
```

- [ ] **Step 3: Commit**

```bash
git add velvet/apps/api/src/modules/posts/posts.routes.ts velvet/apps/api/src/app.ts
git commit -m "feat(api): register posts REST routes"
```

---

### Task 5: Profile wall route

**Files:**
- Modify: `velvet/apps/api/src/modules/profiles/profiles.routes.ts`

- [ ] **Step 1: Add `GET /:id/posts`**

Register **above** `GET /:id` so `/posts` is not swallowed as an id.

Handler: call `listPostsForProfile(id, request.user.sub, { cursor, limit })` from posts service.

```typescript
import { listPostsForProfile } from '../posts/posts.service.js'

app.get('/:id/posts', { onRequest: [app.authenticate] }, async (request, reply) => {
  const { id } = request.params as { id: string }
  const { cursor, limit } = request.query as { cursor?: string; limit?: string }
  try {
    const data = await listPostsForProfile(id, request.user.sub, {
      cursor: cursor ?? undefined,
      limit: limit ? parseInt(limit, 10) : 20,
    })
    return reply.send({ data })
  } catch (err: any) {
    if (err.statusCode === 404) return reply.status(404).send({ status: 'error', message: err.message })
    throw err
  }
})
```

Throw/translate 404 when profile missing.

- [ ] **Step 2: Commit**

```bash
git add velvet/apps/api/src/modules/profiles/profiles.routes.ts
git commit -m "feat(api): add GET /profiles/:id/posts wall listing"
```

---

### Task 6: API tests

**Files:**
- Create: `velvet/apps/api/src/__tests__/posts.test.ts`

- [ ] **Step 1: Scaffold file**

Use `buildApp`, `clearDatabase`, register + login pattern from `profiles.test.ts`.

- [ ] **Step 2: Tests to implement (each: arrange → inject → assert)**

1. `POST /api/v1/posts` — 401 without token.  
2. Create post — 200; body has `mediaUrls`, `visibility`, `id`.  
3. Reject empty `content` + empty `mediaKeys` — 400.  
4. Reject media key wrong prefix — 400.  
5. `PUBLIC` post appears on another user’s timeline (second user registers).  
6. `UNLOCKED_ONLY` hidden until `ProfileUnlock` row created via Prisma in test, then visible.  
7. `DRAFT` visible to author on timeline, not to other user.  
8. `PATCH` non-author — 404 or 403 per your choice (spec prefers 404 for hidden).  
9. `DELETE` author — 204/200; reactions cascade (create reaction then delete post — no orphan rows).  
10. `POST /posts/:id/reactions` — 404 when post not readable.  
11. `GET /api/v1/profiles/:profileId/posts` — returns couple partner posts on shared profile (optional: minimal couple setup from `profiles.test.ts`).

- [ ] **Step 3: Run tests**

```bash
cd velvet && npm run test --workspace=apps/api
```

Expected: all pass including new file.

- [ ] **Step 4: Commit**

```bash
git add velvet/apps/api/src/__tests__/posts.test.ts
git commit -m "test(api): cover posts timeline wall visibility and reactions"
```

---

### Task 7: Web — routing and timeline page

**Files:**
- Rename: `velvet/apps/web/src/pages/Feed.tsx` → `DiscoveryFeed.tsx` (update default export name)
- Create: `velvet/apps/web/src/pages/HomeTimeline.tsx`
- Modify: `velvet/apps/web/src/App.tsx`
- Modify: `velvet/apps/web/src/components/Layout.tsx`

- [ ] **Step 1: Discovery rename**

Move discovery UI to `DiscoveryFeed.tsx`; keep behavior identical.

- [ ] **Step 2: `HomeTimeline.tsx`**

- `useQuery` → `GET /api/v1/posts/timeline` (via `api` base URL — confirm `lib/api` prefix includes `/api/v1`).  
- Render list of `PostCard`.  
- `data-testid="timeline-root"` on container.  
- Button “Compose” opening modal or inline `ComposePost`.

- [ ] **Step 3: `App.tsx` routes**

```tsx
<Route index element={<HomeTimeline />} />
<Route path="discovery" element={<DiscoveryFeed />} />
```

- [ ] **Step 4: Layout nav**

- Link “Home” or “Timeline” → `/`  
- Link “Discover” → `/discovery`  
- Remove stray `// ... (rest of imports)` comment.

- [ ] **Step 5: Run web dev smoke**

```bash
cd velvet && npm run dev --workspace=apps/web
```

Manual: open `/`, see timeline (may be empty).

- [ ] **Step 6: Commit**

```bash
git add velvet/apps/web/src/pages velvet/apps/web/src/App.tsx velvet/apps/web/src/components/Layout.tsx
git commit -m "feat(web): add home timeline route and discovery subroute"
```

---

### Task 8: Web — PostCard and ComposePost

**Files:**
- Create: `velvet/apps/web/src/components/posts/PostCard.tsx`
- Create: `velvet/apps/web/src/components/posts/ComposePost.tsx`

- [ ] **Step 1: `ComposePost`**

- Fields: visibility `<select>`, textarea, file input (multiple, max 4).  
- On submit: for each file, `POST /media/upload-url` with `{ fileName, contentType, purpose: 'POST_MEDIA' }`, then `fetch(uploadUrl, { method: 'PUT', body: file })`, collect `storageKey` from first response (API returns `storageKey`).  
- `POST /posts` with `{ content, visibility, mediaKeys }`.  
- On success: `queryClient.invalidateQueries({ queryKey: ['timeline'] })` and `['profile-posts']` if you use that key.

- [ ] **Step 2: `PostCard`**

- Show author display name from DTO (ensure API returns `authorProfile` snippet — add to `toPostDto` if needed).  
- Images from `mediaUrls`.  
- Reaction buttons: call `POST /posts/:id/reactions` and `DELETE` to toggle.

- [ ] **Step 3: Commit**

```bash
git add velvet/apps/web/src/components/posts
git commit -m "feat(web): compose posts with POST_MEDIA uploads and reactions"
```

---

### Task 9: Web — Profile wall tab

**Files:**
- Modify: `velvet/apps/web/src/pages/ProfileView.tsx`

- [ ] **Step 1: When `activeTab === 'WALL'`**

- `useQuery({ queryKey: ['profile-posts', userId], queryFn: () => api.get(\`/profiles/${userId}/posts\`) })`  
- Map to `PostCard`; empty state copy.  
- Show `ComposePost` only when `profile.id` matches **current user’s profile** (fetch `/profiles/me` or read from auth store if available).

- [ ] **Step 2: Commit**

```bash
git add velvet/apps/web/src/pages/ProfileView.tsx
git commit -m "feat(web): load profile wall posts"
```

---

### Task 10: E2E and profile URL fix

**Files:**
- Modify: `velvet/apps/web/e2e/critical-path.spec.ts`

- [ ] **Step 1: Replace broken `/profiles/me` navigation**

After onboarding, call API to get profile id **or** use UI: e.g. `page.goto` to onboarding profile completion already on `/` — then use `request` context:

```typescript
// After login/register flow, if you have token in localStorage, use page.request.get('http://localhost:5173/api/v1/profiles/me', { headers: { Authorization: `Bearer ${token}` }})
```

Simplest path: add `data-testid` on an element that shows profile link with href containing profile uuid, or parse from network response. **Minimal fix:** use Playwright `page.evaluate` to read Zustand/session if token is exposed — if not, add a tiny `data-testid="my-profile-id"` on Layout when `/profiles/me` response is loaded (optional helper in app).  

**Pragmatic approach:** After registration, backend returns tokens; use `page.request.post` to login again and `get` `/api/v1/profiles/me` with baseURL from config to read `id`, then `page.goto('/profile/' + id)`.

- [ ] **Step 2: Optional timeline assertion**

Expect `data-testid="timeline-root"` visible on `/`.

- [ ] **Step 3: Run Playwright**

```bash
cd velvet/apps/web && npx playwright test
```

Expected: critical path passes.

- [ ] **Step 4: Commit**

```bash
git add velvet/apps/web/e2e/critical-path.spec.ts
git commit -m "test(e2e): fix profile URL and assert timeline"
```

---

### Task 11: Verification gate

- [ ] Run API tests: `cd velvet && npm run test --workspace=apps/api` — **Expected:** all green.  
- [ ] Run web build: `cd velvet && npm run build --workspace=apps/web` — **Expected:** no TS errors.  
- [ ] Run Playwright: `cd velvet/apps/web && npx playwright test` — **Expected:** green.

---

## Notes

- **Author display:** Extend `toPostDto` with `author: { id, nickname, displayName, avatarUrl }` from `User` + `Profile` so `PostCard` does not need extra round-trips.  
- **404 vs 403:** Use **404** for “post not found or not visible” on `GET` single-post if you add it later.  
- **Couple edge:** If `Couple.profileId` is null during tests, wall query may be empty — tests should set `profileId` when linking couple (follow existing `profiles.test.ts` patterns).
