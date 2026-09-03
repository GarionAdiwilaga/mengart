---
name: next-best-practices
description: "Comprehensive Next.js 15/16 App Router best practices, server actions, caching, SSR/RSC architectures, streaming, and performance optimization guide."
risk: safe
source: https://github.com/vercel-labs/agent-skills
date_added: "2026-09-04"
---

# Next.js App Router Best Practices (Next.js 15 / 16)

Authoritative guide for developing scalable, high-performance, and secure applications using Next.js App Router.

## When to Use
- Designing routes, page layouts, and React Server Component (RSC) architectures.
- Implementing Server Actions, data mutations, and optimistic UI updates.
- Configuring caching, ISR, on-demand revalidation (`revalidatePath`, `revalidateTag`), and Cache Components.
- Implementing streaming with React `<Suspense>` and error boundaries (`error.tsx`, `not-found.tsx`).
- Configuring OpenGraph metadata, SEO headers, and middleware authorization.

---

## 1. Server Components vs. Client Components

### The "Leaf Client Component" Rule
Keep Server Components as default. Push `"use client"` down to the smallest possible leaf nodes that require browser APIs, state (`useState`), or event handlers (`onClick`, `onChange`).

```tsx
// ✅ Correct: Page is Server Component, interactive button is Client Component leaf
import { ArtworkDetail } from "@/components/artworks/ArtworkDetail"
import { FavoriteButton } from "@/components/artworks/FavoriteButton" // "use client"

export default async function ArtworkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const artwork = await getArtworkBySlug(slug)
  
  return (
    <main>
      <ArtworkDetail artwork={artwork} />
      <FavoriteButton artworkId={artwork.id} />
    </main>
  )
}
```

### Passing Server Components as Children to Client Components
Wrap Client Component layouts around Server Component children to avoid converting the entire subtree to client execution:

```tsx
// Client Component modal
"use client"
export function ModalDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return open ? <div className="modal">{children}</div> : null
}

// Server Component page passes server-rendered content as children
<ModalDrawer>
  <ServerRenderedUserList />
</ModalDrawer>
```

---

## 2. Server Actions & Mutations

### Server Action Validation & Authorization
* Always declare `"use server"` at the top of the file or function.
* Validate all inputs with Zod schemas on the server.
* Always authenticate and check authorization server-side before executing mutations.

```typescript
"use server"

import { z } from "zod"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

const VoteSchema = z.object({
  votingRoundId: z.string().uuid(),
  submissionId: z.string().uuid(),
  stars: z.number().int().min(1).max(5),
})

export async function castVoteAction(data: unknown) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const parsed = VoteSchema.parse(data)
  await recordVote(session.user.id, parsed)
  
  revalidatePath(`/challenges/[slug]/voting`, "page")
  return { success: true }
}
```

### Mutating with `useTransition` / `useActionState`
Use React 19 `useTransition` or `useActionState` to handle pending states without manual loading flags:

```tsx
"use client"

import { useTransition } from "react"
import { castVoteAction } from "@/app/actions/voting"

export function VoteButton({ roundId, subId }: { roundId: string; subId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await castVoteAction({ votingRoundId: roundId, submissionId: subId, stars: 1 })
        })
      }}
    >
      {isPending ? "Menyimpan..." : "Beri Star"}
    </button>
  )
}
```

---

## 3. Data Fetching, Streaming & Suspense

### Non-Blocking Data Streams with `<Suspense>`
Never block the whole page on a slow secondary query. Render fast shell content immediately and stream slow components:

```tsx
export default function GalleryPage() {
  return (
    <div>
      <GalleryHeader /> {/* Renders immediately */}
      <Suspense fallback={<ArtworkGridSkeleton />}>
        <ArtworkFeed /> {/* Streams in asynchronously */}
      </Suspense>
    </div>
  )
}
```

### Parallel Data Fetching
Avoid sequential `await` waterfalls when requests are independent:

```typescript
// ❌ Sequential Waterfall:
const user = await getUser(userId)
const artworks = await getArtworks(userId)

// ✅ Parallel Fetching:
const [user, artworks] = await Promise.all([
  getUser(userId),
  getArtworks(userId)
])
```

---

## 4. Caching & Revalidation Hygiene

1. **Explicit Cache Invalidation:**
   - After mutations in Server Actions, immediately invalidate relevant paths using `revalidatePath(path, type)` or `revalidateTag(tag)`.
2. **Dynamic Route Parameters (Next.js 15/16):**
   - In Next.js 15+, `params` and `searchParams` in page components are Promises and must be awaited:
   ```typescript
   export default async function Page({ params }: { params: Promise<{ id: string }> }) {
     const { id } = await params
     // ...
   }
   ```
3. **Preventing Stale Cache Regressions:**
   - Use dynamic segments or `unstable_noStore()` / `connection()` when serving user-specific or real-time transactional data (such as active ballots or audit logs).

---

## 5. Metadata & SEO

Export static or dynamic `generateMetadata` functions for all public routes:

```typescript
import type { Metadata } from "next"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const artwork = await getArtworkBySlug(slug)
  
  return {
    title: `${artwork.title} — Mengart Atelier`,
    description: artwork.description,
    openGraph: {
      title: artwork.title,
      images: [{ url: artwork.previewUrl, width: 1200, height: 630 }],
    },
  }
}
```
