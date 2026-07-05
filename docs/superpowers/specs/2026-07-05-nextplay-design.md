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
- Secrets (IGDB/Twitch, Steam, Claude, mot de passe Postgres) : K8s Secrets référencés
  par `secretKeyRef`, jamais commités.

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
  en pause / souhaité / à trier), **note** sur 10, **avis** texte, **plateformes
  jouées** (liste — distinctes des plateformes où le jeu existe), **période de jeu**
  (année(s) ou texte libre, précision variable selon les souvenirs), **heures
  estimées**, **source** (`manual` | `steam`), temps de jeu Steam réel si disponible.
- **`Recommendation`** — historique des recommandations : envie exprimée (texte +
  types), jeux suggérés, justifications du LLM, réaction de l'utilisateur
  (*intéressé* / *déjà joué* / *pas pour moi*). Ce feedback nourrit les recos suivantes.

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
  grille de jaquettes. Navigation principale par filtres/facettes : statut, plateforme
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
- Limite connue : les résumés IGDB n'existent qu'en anglais ; une traduction
  automatique est envisagée avec l'intégration de l'API Claude (recommandations).

### 5.3 Fiche jeu

Jaquette et métadonnées IGDB d'un côté, vécu personnel de l'autre. Édition inline des
données personnelles.

### 5.4 Import Steam (page Réglages)

- Saisie du SteamID64 (+ clé Web API en secret). Appel `GetOwnedGames`.
- Matching Steam → IGDB via les IDs Steam référencés par IGDB (fiable). Les non-matchés
  vont dans la file « à trier » pour résolution manuelle ou création de fiche manuelle.
- Les jeux importés arrivent avec le statut **« à trier »** ; une file de triage permet
  de les qualifier (statut, note, avis) au fil de l'eau, ou de les ignorer (jeux de
  bundles jamais lancés).
- **Idempotent et relançable** : jamais de doublon ; une relance met à jour les temps de
  jeu.
- La page Réglages est structurée en « Sources d'import » extensibles (Steam en v1,
  emplacements prévus pour PSN/Xbox).

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
- **Steam Web API** : clé + SteamID64. `GetOwnedGames` pour la liste et les temps de
  jeu.
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
