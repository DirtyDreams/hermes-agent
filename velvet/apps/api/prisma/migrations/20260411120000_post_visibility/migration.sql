-- Replace isPublic with visibility; cascade delete reactions

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Post' AND column_name = 'visibility'
  ) THEN
    ALTER TABLE "Post" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Post' AND column_name = 'isPublic'
  ) THEN
    UPDATE "Post" SET "visibility" = CASE WHEN "isPublic" = true THEN 'PUBLIC' ELSE 'UNLOCKED_ONLY' END;
    ALTER TABLE "Post" DROP COLUMN "isPublic";
  END IF;
END $$;

ALTER TABLE "PostReaction" DROP CONSTRAINT IF EXISTS "PostReaction_postId_fkey";
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
