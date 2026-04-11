-- Post.visibility replaces isPublic; PostReaction.postId cascades on delete.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Post'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Post' AND column_name = 'isPublic'
    ) THEN
      ALTER TABLE "Post" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';
      UPDATE "Post" SET "visibility" = CASE WHEN "isPublic" = true THEN 'PUBLIC' ELSE 'UNLOCKED_ONLY' END;
      ALTER TABLE "Post" DROP COLUMN "isPublic";
    ELSIF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Post' AND column_name = 'visibility'
    ) THEN
      ALTER TABLE "Post" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PUBLIC';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'PostReaction'
  ) THEN
    ALTER TABLE "PostReaction" DROP CONSTRAINT IF EXISTS "PostReaction_postId_fkey";
    ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
