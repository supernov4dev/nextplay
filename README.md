# NextPlay

Bibliothèque de jeux vidéo personnelle : tous les jeux d'une vie de joueur, avec
notes et avis, et à terme des recommandations ciblées (« à quoi jouer ? »).

Spec et plans : `docs/superpowers/`.

## Démarrage

```bash
npm run db:up      # Postgres de dev (Docker)
npm run dev        # → http://localhost:3000
```

Variables d'environnement : copier `.env.example` en `.env` et renseigner les
clés IGDB (app à créer sur https://dev.twitch.tv/console/apps).

## Scripts utiles

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm test` | Suite de tests (Vitest — nécessite la base de dev démarrée) |
| `npm run translate:fr` | Traduit en français les résumés de jeux pas encore traduits, via Claude Code (`claude -p`, couvert par l'abonnement) |
| `npm run db:up` / `db:down` | Démarre / arrête le Postgres de dev |
| `npx prisma migrate dev` | Applique/crée une migration (puis voir ⚠ ci-dessous) |
| `npm run db:push:test` | Synchronise le schéma sur la base de test |

## Dépannage

**« Unknown argument … » (PrismaClientValidationError) après une migration**,
ou « Unexpected end of JSON input » dans l'interface : le cache persistant de
Turbopack (`.next/`) sert encore l'ancien client Prisma. Correctif :

```bash
# arrêter le serveur dev, puis
rm -rf .next
npm run dev
```

À faire après chaque `prisma migrate dev` / `prisma generate` si le schéma a
changé depuis le dernier démarrage du serveur.
