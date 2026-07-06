# NextPlay — Document de design (v1)

**Date :** 2026-07-05
**Statut :** validé (brainstorming avec l'utilisateur)

## 1. Contexte et objectif

NextPlay est une bibliothèque de jeux vidéo personnelle et auto-hébergée. Elle recense
**tous** les jeux auxquels l'utilisateur a joué au cours de sa vie, sur toutes les
plateformes (PC, consoles modernes et rétro), avec des notes et avis purement personnels.

Cette bibliothèque sert de socle à la fonctionnalité phare : répondre à la question
« **je ne sais pas à quoi jouer en ce moment** » par des recommandations de **nouveaux
jeux** (jamais joués), extrêmement ciblées car fondées sur les avis écrits, les notes,
les temps de jeu et les retours donnés sur les recommandations précédentes.

**Utilisateurs :** un seul en v1 (mode solo, sans écran de connexion), mais le modèle de
données rattache toute donnée personnelle à un utilisateur pour permettre le
multi-comptes plus tard sans migration douloureuse.

## 2. Périmètre

### Inclus en v1

- Bibliothèque consultable : tableau de bord + vue « tous les jeux » dense et filtrable.
- Ajout de jeux : unitaire (recherche IGDB), en série (saisie rapide de collections
  rétro), création 100 % manuelle pour les jeux absents d'IGDB.
- Import Steam (jeux possédés + temps de jeu réels), idempotent et relançable.
- Fiche jeu : métadonnées IGDB + vécu personnel éditable.
- Recommandations IA (« À quoi jouer ? ») via l'API Claude, avec feedback mémorisé.
- Page Réglages : sources d'import (extensible), clés API.
- Interface en français, responsive (PC et mobile via navigateur).

### Hors périmètre v1 (envisagé pour la suite)

- Multi-comptes et authentification.
- Imports PSN, Xbox (API non officielles) ; Nintendo (pas d'API exploitable).
- Vue chronologique (frise de la vie de joueur).
- Statistiques avancées (répartitions par genre/année/plateforme).
- Listes personnalisées ; recommandations depuis le backlog.

## 3. Architecture

### Stack

| Composant | Choix | Justification |
|---|---|---|
| Application | Next.js (App Router) + TypeScript | Un seul artefact (UI + API), aligné sur l'écosystème existant (React, ADR-007 du homelab) |
| ORM | Prisma | Migrations versionnées, typage fort |
| Base de données | PostgreSQL 16 (alpine) in-cluster | Pattern n8n existant ; choix Postgres-plutôt-que-SQLite déjà acté dans le homelab |
| Métadonnées jeux | API IGDB | Base la plus riche (genres, thèmes, jeux similaires, IDs Steam) |
| Import | Steam Web API | API officielle, gratuite, fiable |
| Recommandations | API Claude (modèle configurable) | Exploite les avis texte, justifications personnalisées |
| Hébergement | k3s (srv01) via Flux CD, ingress Traefik | Conventions du repo homelab |

### Schéma

```
Navigateur (PC / mobile)
        │  http(s)://nextplay.local (Traefik)
        ▼
┌──────────────────────────────────────┐   namespace k8s : nextplay
│  nextplay (Next.js, TypeScript)      │
│  • UI React (App Router)             │
│  • API interne (route handlers)      │
│  • ORM : Prisma                      │
└──────┬───────────┬──────────┬────────┘
       │           │          │
       ▼           ▼          ▼
  PostgreSQL    IGDB API   Steam API / API Claude
  (in-cluster)  (métadonnées) (import)  (recos)
```

- Un Deployment Next.js + un Deployment Postgres avec PVC `local-path`, dans un
  namespace `nextplay` dédié (copie du pattern n8n).
- Secrets (IGDB/Twitch, Claude, mot de passe Postgres) : K8s Secrets référencés
  par `secretKeyRef`, jamais commités. Exception : les identifiants Steam (clé Web
  API + SteamID64) se configurent dans l'UI et vivent en base (cf. `ImportSource`).

## 4. Modèle de données (Prisma → Postgres)

- **`User`** — un utilisateur seedé en v1. Toute donnée personnelle y est rattachée.
- **`Game`** — la fiche « objective » d'un jeu, cache local des métadonnées IGDB :
  `igdbId` (unique, nullable pour les fiches manuelles), titre, jaquette, année de
  sortie, genres, thèmes, plateformes existantes, résumé, note agrégée IGDB, IDs Steam.
  **Seuls les jeux ajoutés à la bibliothèque (ou proposés par une recommandation) sont
  stockés — jamais un miroir d'IGDB.** Une fois la fiche créée, la consultation ne
  sollicite plus IGDB.
- **`LibraryEntry`** — le vécu de l'utilisateur sur un jeu (cœur du projet) :
  `userId` + `gameId` (unique ensemble), **statut** (terminé / en cours / abandonné /
  en pause / souhaité / **collection** / à trier — « Collection », ajouté le
  2026-07-06 : possédé mais ne compte pas dans les jeux joués ; sert aux jeux
  Steam jamais lancés et aux non-jeux type bêta/démo requalifiés à la main),
  **note sur 20** (entier, affichée en badge coloré
  type Metacritic), **platiné / 100 %** (booléen indépendant du statut, badge 🏆),
  **avis** texte, **plateformes jouées** (vocabulaire fermé défini dans
  `src/lib/platforms.ts` — puces cliquables, plateformes du jeu selon IGDB
  pré-suggérées), **heures estimées**, **source** (`manual` | `steam`), temps de jeu
  Steam réel si disponible.
- **`PlayPeriod`** — périodes de jeu structurées, plusieurs par entrée : chaque
  période est une année seule ou une plage d'années (`startYear`, `endYear?`).
  Remplace l'ancien texte libre (révision du 2026-07-05, retours d'usage) —
  exploitable pour la frise chronologique et les recommandations.
- **`Recommendation`** — historique des recommandations : envie exprimée (texte +
  types), jeux suggérés, justifications du LLM, réaction de l'utilisateur
  (*intéressé* / *déjà joué* / *pas pour moi*). Ce feedback nourrit les recos suivantes.
- **`ImportSource`** (révision du 2026-07-06, plan 2) — configuration d'une source
  d'import par utilisateur : `provider` (enum, `STEAM` seul en v1), `apiKey`,
  `accountId` (SteamID64 pour Steam), `lastImportAt`, unique (`userId`, `provider`).
  Les identifiants se saisissent dans la page Réglages et sont stockés en base
  (app solo auto-hébergée, Postgres privé) — pas de variable d'environnement à gérer.
  Champs associés : `Game.steamAppId` (unique, ancre d'idempotence) et
  `LibraryEntry.steamPlaytimeMinutes` (temps Steam réel, distinct des heures estimées
  saisies à la main, jamais écrasées).

**Règle anti-duplication (centrale) :** un jeu = une seule fiche `Game` (identifiée par
`igdbId`) et une seule `LibraryEntry` par utilisateur. Ajouter un jeu déjà présent (à la
main ou via import) ne crée rien : l'app propose d'ajouter une plateforme jouée à
l'entrée existante (ex. Hades noté sur Switch → l'import Steam y accroche « PC » et le
temps de jeu Steam). Si un besoin d'avis distincts par plateforme émerge, le modèle
évoluera à ce moment-là.

## 5. Fonctionnalités

### 5.1 Bibliothèque

Deux niveaux, pour rester lisible avec plusieurs centaines de jeux (éviter le syndrome
« méga-grille Epic Games ») :

- **Accueil = tableau de bord** : rangées thématiques courtes (type Netflix) — *En
  cours*, *À trier*, *Les mieux notés*, *Ajoutés récemment* — et quelques chiffres-clés
  (total de jeux, répartition par statut).
- **« Tous les jeux » = vue dense** : liste compacte par défaut (petite jaquette,
  titre, note, statut, plateformes, période — colonnes triables), bascule possible en
  grille de jaquettes. La colonne heures affiche les heures estimées saisies à la
  main, et à défaut le **temps Steam réel** (révision du 2026-07-06) ; le tri et le
  filtre par heures portent sur la valeur combinée. Navigation principale par filtres/facettes : statut, plateforme
  jouée, genre, décennie, note, source. Recherche plein-texte locale.

### 5.2 Ajout de jeux

Trois portes d'entrée :

1. **Unitaire** : recherche IGDB (résultats avec jaquette + année pour désambiguïser) →
   sélection → métadonnées pré-remplies → saisie du vécu (statut, note, avis,
   plateformes jouées, période, heures). Bouton « jeu introuvable ? création manuelle ».
2. **En série** (collections rétro PS1/PS2/etc.) : session d'ajout avec valeurs par
   défaut (ex. plateforme = PS2, statut = terminé), puis enchaînement des recherches —
   chaque jeu s'ajoute en deux clics, le champ de recherche reste actif.
3. **Import Steam** (voir 5.4).

La recherche IGDB interroge l'API en direct et n'écrit rien en base tant qu'aucun jeu
n'est sélectionné.

Affinements issus des premiers retours d'usage (2026-07-05) :
- Les résultats de recherche affichent un **badge de type** (Jeu principal, Remake,
  Portage, DLC, Compilation…) et les **plateformes**, en plus de l'année — IGDB
  référence chaque édition séparément, ces éléments désambiguïsent (ex. les multiples
  Final Fantasy VII).
- L'écran de qualification affiche la **fiche IGDB complète** (jaquette, type, genres,
  plateformes, note IGDB, résumé) au-dessus du formulaire de vécu.
- Un bouton **« ← Retour à la recherche »** ramène à la requête et aux résultats en
  cours (état conservé).
- Limite connue : les résumés IGDB n'existent qu'en anglais. Traduction en
  français par lot via Claude Code non-interactif (`npm run translate:fr`,
  couvert par l'abonnement — contrainte : pas de dépense API). Le champ
  `Game.summaryTranslated` trace ce qui reste à traduire. Un chemin API Claude
  temps réel existe mais reste dormant sans `ANTHROPIC_API_KEY`.

### 5.2 bis Découvrir (ajout par suggestion — révision du 2026-07-05)

Page « Découvrir » : constitution rapide de la bibliothèque façon « match ».
On choisit une plateforme (+ décennie optionnelle) ; les jeux principaux IGDB
défilent en cartes, du plus connu au plus obscur (tri par nombre de votes).
Trois actions (boutons + clavier) :
- **« J'y ai joué »** → ajout en statut « À trier », plateforme pré-remplie
  (qualification différée via la file de triage) ;
- **« Je n'y ai pas joué »** → exclusion définitive des prochains decks
  (table `DiscoveryExclusion`) ;
- **« Passer »** → non persisté, le jeu réapparaîtra dans un prochain deck.
Les jeux déjà en bibliothèque sont exclus du deck.

### 5.3 Fiche jeu

Jaquette et métadonnées IGDB d'un côté, vécu personnel de l'autre. Édition inline des
données personnelles.

### 5.4 Import Steam (page Réglages) — précisé le 2026-07-06 (plan 2)

- **Page Réglages** (`/reglages`, dans la navigation) structurée en « Sources
  d'import » extensibles : carte Steam en v1, emplacements PSN/Xbox affichés
  désactivés. La carte Steam comporte le formulaire (clé Web API + SteamID64,
  stockés en base via `ImportSource`), un bouton « Tester la connexion », le bouton
  « Importer », la date et le bilan du dernier import. Une aide en français indique
  où obtenir la clé (steamcommunity.com/dev/apikey) et le SteamID64.
- **Flux d'import** (`POST /api/import/steam`) : appel `GetOwnedGames` (avec noms),
  puis pour chaque jeu possédé :
  1. `steamAppId` déjà connu → simple rafraîchissement du temps de jeu ;
  2. sinon matching Steam → IGDB par lots via les IDs Steam référencés par IGDB
     (`external_games`), limite 4 req/s respectée ;
  3. matché → fiche `Game` créée depuis IGDB + entrée (source `STEAM`,
     plateforme « PC », temps Steam) avec le statut **« à trier »** si du temps
     de jeu existe, **« collection »** si 0 min (jeu possédé jamais lancé —
     révision du 2026-07-06). Jeu déjà en bibliothèque → fusion conforme à la
     règle anti-duplication : ajout de « PC » et du temps Steam (jamais à la
     baisse), statut/note/avis existants intacts — à une exception près :
     une entrée « collection » dont le temps Steam passe de 0 à positif est
     **promue automatiquement en « à trier »** (vous y avez joué depuis).
     La transition exacte 0 → positif protège les entrées requalifiées à la
     main en « collection » avec du temps de jeu : elles ne sont jamais re-promues ;
  4. non-matché → fiche manuelle (titre Steam, `steamAppId`, sans `igdbId`) +
     entrée « à trier », à qualifier ou ignorer au fil de l'eau (bundles jamais
     lancés).
- **Rapport d'import** : nouveaux / mis à jour / non-matchés.
- **Idempotent et relançable** : jamais de doublon (garanti par `steamAppId` unique
  + anti-duplication) ; une relance ou un import interrompu se rejoue sans risque et
  met à jour les temps de jeu.
- **Cas piège** : un profil Steam privé renvoie une liste vide sans erreur — détecté
  et signalé (« votre profil doit être public le temps de l'import »). Clé invalide /
  SteamID inconnu → messages français explicites.

### 5.5 « À quoi jouer ? » (recommandations)

- Saisie de l'envie du moment : **chips de type** (RPG, Course, Combat, Stratégie,
  Plateforme, Narratif, Court/Long…) combinables avec un **texte libre** (« un jeu
  court et contemplatif »).
- L'app envoie à l'API Claude un condensé de la bibliothèque (titres, genres, notes,
  extraits d'avis, temps de jeu, feedbacks passés) + l'envie exprimée, et demande une
  réponse JSON structurée : ~5 jeux **non présents dans la bibliothèque**, chacun avec
  une justification personnalisée.
- Chaque suggestion est enrichie via IGDB (jaquette, fiche) avant affichage, et
  stockée en base.
- Sous chaque suggestion : *Intéressé* / *Déjà joué* / *Pas pour moi* — mémorisé pour
  les recos suivantes. « Déjà joué » propose d'ajouter le jeu à la bibliothèque.
- Coût : de l'ordre de quelques centimes par demande ; modèle configurable.

## 6. Intégrations externes

- **IGDB** : authentification Twitch (client ID + secret, flux *client credentials*) ;
  token (~60 jours) renouvelé automatiquement. Limite de 4 req/s respectée côté app.
  Sollicité uniquement pour : recherche à l'ajout, matching d'import, enrichissement
  des recommandations.
- **Steam Web API** : clé + SteamID64, saisis dans la page Réglages (stockés en
  base). `GetOwnedGames` pour la liste et les temps de jeu. Gratuite.
- **API Claude** : réponses JSON structurées ; prompt construit à partir de la
  bibliothèque et de l'historique de feedback.

## 7. Gestion d'erreurs

- **Dégradation douce** : la bibliothèque (consultation, édition) fonctionne sans
  aucune API externe. Recherche IGDB en échec → proposition de création manuelle.
  Reco en échec → message d'erreur + bouton réessayer.
- **Import repriable** : un import interrompu se relance sans créer de doublon.
- Messages d'erreur en français côté UI ; détails techniques dans les logs du pod
  (observable via la stack Prometheus/Grafana existante).

## 8. Tests

Philosophie « simple, sans sur-ingénierie » :

- **Vitest** sur la logique métier sensible : anti-duplication / fusion de plateformes,
  matching Steam → IGDB, construction du prompt de reco, parsing des réponses LLM.
- **Tests d'intégration** des routes API principales contre un Postgres jetable
  (Docker sur la machine de dev WSL2).
- Pas de tests E2E navigateur en v1.

## 9. Déploiement et CI

- **Dockerfile** Next.js *standalone* (image finale légère), requêtes/limites CPU-RAM
  modestes, adapté au nœud N100 / 16 Go.
- **GitHub Actions** : lint + tests + build → push `ghcr.io/supernov4dev/nextplay`
  (tag semver, pas de `:latest`).
- **Manifestes k8s dans le repo `homelab`** (`cluster/apps/nextplay/`) : namespace,
  Postgres 16-alpine + PVC `local-path`, Deployment, Service, Ingress Traefik
  `nextplay.local`, Secrets manuels. Manifestes commentés en français, conformes au
  pattern n8n.
- **Sauvegarde** : CronJob `pg_dump` vers le NFS Synology.
- **Dev local** : `docker compose up` (app + Postgres) sur WSL2.

## 10. Évolutions envisagées (post-v1)

Multi-comptes, imports PSN/Xbox, vue chronologique, statistiques, listes
personnalisées, recommandations depuis le backlog, avis distincts par plateforme si le
besoin émerge.
