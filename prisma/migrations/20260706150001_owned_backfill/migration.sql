-- Reclassement une-fois : les jeux importés de Steam encore « À trier »
-- avec 0 min de jeu sont des possessions jamais lancées → « Collection ».
-- Ce que l'utilisateur a déjà qualifié n'est pas touché.
UPDATE "LibraryEntry"
SET "status" = 'OWNED'
WHERE "source" = 'STEAM'
  AND "status" = 'TO_SORT'
  AND "steamPlaytimeMinutes" = 0;
