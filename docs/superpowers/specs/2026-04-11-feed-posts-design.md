# Feed, posts, and reactions — design spec

**Date:** 2026-04-11  
**Status:** Approved (brainstorming session)  
**Product:** Velvet (`velvet/` monorepo)

---

## 1. Summary

Ship **text + arbitrary post media** (via existing presigned upload flow with `POST_MEDIA`), **per-post visibility** (public / unlocked-only / draft), a **profile wall** and a separate **home timeline**, and **reactions** (one per user per post, replaceable type). Attachments are stored as ordered **`Post.mediaKeys[]`** for MVP, with a documented path to per-file rows later.

---

## 2. Goals and non-goals

### Goals

- Create, update, and delete posts (author-only) with validation and safe error behavior.
- **Profile wall:** `ProfileView` wall lists posts for that profile with correct visibility for the viewer.
- **Home timeline:** chronological list of posts the current user is allowed to read, including others’ public posts and unlocked-only posts where applicable, plus their own posts (including drafts where specified).
- **Reactions:** upsert and remove; types aligned with existing `PostReaction.type` (`LIKE`, `LOVE`, `WOW`); enforce readable-post rule before reacting.
- **Media:** full wiring using `POST /api/v1/media/upload-url` with `purpose: POST_MEDIA`, client upload to object storage, server validation of key prefix on post create/update.

### Non-goals (MVP)

- Fan-out feeds, ranking, reposts, comments, @mentions, hashtags.
- `PostAttachment` table (optional follow-up migration).
- Blocking/muting affecting timeline (document as future).
- Server-side image moderation for post media.
- Separate `publishedAt` field (publishing = changing visibility away from `DRAFT`).

---

## 3. Architecture decisions

### 3.1 Attachment strategy (chosen)

**Approach 1 — Lean:** persist ordered **`mediaKeys: string[]`** on `Post`. Validate keys on write. **Extension:** introduce `PostAttachment` later without breaking the public API (dual-read or migration).

Rejected for MVP: client-only URLs in content (no server truth); rich `PostAttachment` table in the same milestone (higher schema load).

### 3.2 Timeline strategy

**Pull model:** single query (with pagination cursor) that returns posts the viewer may read under visibility rules. No fan-out.

### 3.3 Authorship and couples

- **`Post.authorId`** remains **`User.id`**.
- **Individual profile wall:** posts where `post.authorId === Profile.userId` for that profile.
- **Couple shared profile wall** (`Couple.profileId === profileId`): posts where `post.authorId` is **`partner1Id` or `partner2Id`** of that couple.

### 3.4 Couple + drafts (v1 rule)

- **Default MVP rule:** `DRAFT` posts are visible only to **`post.authorId`** on timeline and wall queries.
- **Couple shared wall:** drafts created by partner A appear on the shared wall for **A only** unless extended in implementation to include partner B (explicit follow-up if product requires both to see drafts).

---

## 4. Data model (Prisma)

- Add **`visibility: String`** (or Prisma enum) with values **`PUBLIC`**, **`UNLOCKED_ONLY`**, **`DRAFT`**.
- **Remove `isPublic`** after migration mapping: `true → PUBLIC`, `false → UNLOCKED_ONLY` (adjust if no legacy rows).
- Keep **`content`**, **`mediaKeys`**, **`authorId`**, timestamps; ensure **`PostReaction`** uses `onDelete: Cascade` from `Post` if not already.

---

## 5. Visibility semantics

| Value | Who can read |
|--------|----------------|
| `PUBLIC` | Any authenticated user (timeline + wall when loading that profile’s posts). |
| `UNLOCKED_ONLY` | Author always; others only if `ProfileUnlock` exists: `(userId = viewerId, targetId = profileId)` for a **profile `profileId` on which this post appears** (wall membership rule in §3.3). |
| `DRAFT` | Author only (see §3.4 for couple nuance). |

**Read by id (if implemented):** use **`404`** for non-visible posts to avoid leaking existence.

**Publish:** `PATCH` visibility from `DRAFT` to `PUBLIC` or `UNLOCKED_ONLY`.

---

## 6. API

**Prefix:** register `modules/posts/` at **`/api/v1/posts`**.

| Method | Path | Behavior |
|--------|------|----------|
| `POST` | `/posts` | Create: `content`, `visibility`, optional `mediaKeys[]`. Auth required. |
| `PATCH` | `/posts/:id` | Update fields; author only. |
| `DELETE` | `/posts/:id` | Author only; cascade reactions. |
| `GET` | `/posts/timeline` | Cursor/limit; filtered by visibility for `jwt.sub`. |
| `GET` | `/profiles/:profileId/posts` | Wall list; implement on **`profiles` routes** or delegate to posts service. |
| `POST` | `/posts/:id/reactions` | Body `{ type }`; upsert unique `(postId, userId)`. |
| `DELETE` | `/posts/:id/reactions` | Remove current user’s reaction. |

**Media**

- Reuse **`POST_MEDIA`** in `@velvet/media` and existing **`/api/v1/media/upload-url`**.
- **Post create/patch** validates each key matches `POST_MEDIA/<authorUserId>/…` and enforces **max attachment count** (e.g. 4) and **max `content` length** (e.g. 5k–10k — exact in implementation plan).

**Responses**

- Prefer returning **`mediaUrls[]`** (or equivalent) resolved server-side from keys so the web app does not duplicate storage URL building.

**Shared validation:** Zod schemas in shared package for create/update DTOs and enums.

---

## 7. Errors, limits, abuse

- **400:** validation, invalid keys, empty post (both empty text and zero media).
- **401:** unauthenticated access to protected routes.
- **404:** unknown post or post not visible; unknown profile for wall.
- **Stricter rate limits** on post create, patch, and reactions (exact numbers in implementation plan); consider tighter limit on `upload-url` for `POST_MEDIA`.
- **Content safety:** React default escaping; no HTML body in MVP.
- **Known gap:** no block list filtering on timeline in this milestone.

---

## 8. Web (React)

- **New home/timeline route** separate from discovery swipe feed.
- **Wall tab** on `ProfileView` loads wall API; reuse post card where possible.
- **Compose:** visibility selector, text, multi-file upload via presign flow, submit `POST /posts`.
- **Drafts:** show on **own** wall (and optionally nowhere else for MVP).
- **TanStack Query:** invalidate `timeline` and `profile-posts` after create/update/delete.

---

## 9. Testing

**API:** create/update/delete; media key prefix enforcement; visibility matrix (public / unlocked-only / draft); couple wall membership; reactions with read gate; 404 for hidden posts.

**E2E:** smoke path for timeline + create + wall visibility (fixture or seed as needed if CI storage is flaky).

---

## 10. Self-review checklist

- [x] No unresolved TBD in normative sections; numeric limits deferred to implementation plan by explicit reference.
- [x] Couple draft behavior called out to avoid ambiguity (author-only default).
- [x] Scope fits one implementation plan (posts module + web surfaces + tests).

---

## 11. Revision history

| Date | Change |
|------|--------|
| 2026-04-11 | Initial spec from brainstorming (§1–§5 approved in session). |
