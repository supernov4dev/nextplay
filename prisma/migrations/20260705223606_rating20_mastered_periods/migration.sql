-- Note désormais sur 20 : conversion des notes existantes (sur 10 → ×2)
UPDATE "LibraryEntry" SET "rating" = "rating" * 2 WHERE "rating" IS NOT NULL;

-- AlterTable : Platiné / 100 %
ALTER TABLE "LibraryEntry" ADD COLUMN "mastered" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable : périodes de jeu structurées
CREATE TABLE "PlayPeriod" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER,

    CONSTRAINT "PlayPeriod_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PlayPeriod" ADD CONSTRAINT "PlayPeriod_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LibraryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reprise best-effort des anciennes périodes texte ("1998" ou "1998-2001")
INSERT INTO "PlayPeriod" ("id", "entryId", "startYear", "endYear")
SELECT md5(random()::text || "id"), "id",
       (substring("playPeriod" from '^(\d{4})'))::int,
       (substring("playPeriod" from '^\d{4}\s*[-–]\s*(\d{4})\s*$'))::int
FROM "LibraryEntry"
WHERE "playPeriod" ~ '^\d{4}(\s*[-–]\s*\d{4})?\s*$';

-- AlterTable : suppression de l'ancien champ texte
ALTER TABLE "LibraryEntry" DROP COLUMN "playPeriod";
