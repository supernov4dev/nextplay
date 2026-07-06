-- Statut « Collection » : possédé mais ne compte pas dans les jeux joués
-- (jeux Steam jamais lancés, non-jeux type bêta/démo requalifiés à la main).
ALTER TYPE "EntryStatus" ADD VALUE 'OWNED';
