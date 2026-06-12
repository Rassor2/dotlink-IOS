# Dot Link — Product Requirements Document (PRD)

## Vision
Un voyage cosmique en cinq mondes. Une application mobile de puzzle premium
(style Flow Free hybride) où le joueur relie les étoiles de mêmes couleurs
sans croiser les lignes, en remplissant la grille pour rallumer l'univers.

## Plateforme
- React Native (Expo SDK 54) — iOS, Android (Expo Go + builds natifs)
- Backend FastAPI + MongoDB (préfixe `/api`)
- Routing : expo-router (file-based)

## Personnage / Lore
Le joueur est un **Tisseur d'Étoiles**, voyageur silencieux des cinq mondes.
Chaque constellation perdue attend qu'il la relie. À mesure qu'il trace les
voies de lumière, le Vide recule et l'univers se souvient.

## Cinq mondes (difficultés)
| # | Clé      | Nom      | Étiquette  | Grille | Couleurs | Niveaux |
|---|----------|----------|------------|--------|----------|---------|
| 1 | lumina   | Lumina   | Débutant   | 4×4    | 2-3      | 60      |
| 2 | aurora   | Aurora   | Facile     | 5×5    | 3-4      | 70      |
| 3 | zenith   | Zenith   | Moyen      | 6×6    | 3-4      | 80      |
| 4 | eclipse  | Eclipse  | Difficile  | 7×7    | 4-5      | 90      |
| 5 | void     | Void     | Impossible | 8×8    | 4-5      | 100     |

**Total : 400 niveaux**, tous générés via Hamiltonian paths (snake / col-snake /
spirale / zigzag) puis splittés en N segments colorés. Solvabilité garantie
car la path de base **est** la solution.

Déverrouillage : Lumina toujours ouvert. Les autres mondes s'ouvrent dès que
5 niveaux du monde précédent ont été terminés.

## Gameplay
- Drag depuis un point coloré → tracer le chemin jusqu'au point jumeau.
- Le tracé doit être adjacent (4-connecté) et ne pas se croiser.
- Toucher la ligne d'une autre couleur l'efface (comportement Flow Free).
- Toute la grille doit être remplie pour valider le niveau.
- **Étoiles** : 3 si chaque couleur est résolue en un seul trait, sinon 2, sinon 1.
- **Bonus coins** : +10 × étoiles à chaque victoire.

## Économie
- Solde de départ : **250 pièces**.
- **Indice** : 25 pièces — révèle le début du chemin d'une couleur non résolue.
- **Reset** : gratuit.
- **Reward video** (mock) : +50 pièces, illimité.

## Monétisation
### Packs Stripe (test mode `sk_test_emergent`)
| Pack    | Coins | Bonus  | Total  | Prix    |
|---------|-------|--------|--------|---------|
| spark   | 200   | 0      | 200    | $1.99   |
| nova    | 1200  | 200    | 1 400  | $9.99   |
| galaxy  | 3000  | 800    | 3 800  | $19.99  |
| cosmos  | 8500  | 2500   | 11 000 | $49.99  |

Flux : tap pack → POST `/api/checkout/create` → Stripe hosted Checkout via
`expo-web-browser` → polling `/api/checkout/status/{session_id}` → crédit
idempotent + retour `/checkout-return`.

### Pubs
**Mockées** dans la V1 (UI prête pour AdMob). Bouton "Regarder une vidéo
bonus" → 2,2 s de simulation → POST `/api/ads/reward` → +50 pièces.

## Audio / Haptics
- Effets : tap, connect, win, coin, error — générés en base64 WAV au boot,
  joués via **expo-audio**.
- Haptics : sélection/light/medium/success/error via **expo-haptics**.
- Toggles persistés : sons, musique, haptiques (musique = stub pour V1).

## Persistance
- **Local** : `@/src/utils/storage` (AsyncStorage) — clé `dotlink_profile_v1`.
- **Cloud** : MongoDB (`profiles`, `payments`, `stripe_events`) — sync
  automatique 1,2 s après chaque mutation. Merge bidirectionnel : best stars
  & max coins.

## API
| Route                                              | Méthode | Description                              |
|----------------------------------------------------|---------|------------------------------------------|
| `/api/difficulties`                                | GET     | Liste des 5 mondes                       |
| `/api/levels/{difficulty}`                         | GET     | Tous les niveaux d'un monde              |
| `/api/level/{difficulty}/{index}?include_solution` | GET     | Un niveau (option solution)              |
| `/api/profile/init`                                | POST    | Crée/récupère un profil device_id        |
| `/api/profile/{device_id}`                         | GET     | Lit un profil                            |
| `/api/profile/sync`                                | POST    | Merge progression                        |
| `/api/shop/packs`                                  | GET     | 4 packs                                  |
| `/api/checkout/create`                             | POST    | Crée une session Stripe                  |
| `/api/checkout/status/{session_id}`                | GET     | Poll + crédite (idempotent)              |
| `/api/webhook/stripe`                              | POST    | Webhook avec idempotency sur event_id    |
| `/api/ads/reward`                                  | POST    | Reward video (mocked)                    |

## Direction artistique
- Palette **Glass / Luxe DARK** — obsidian (#050505) + gold (#F5C851) +
  emerald (#32A852).
- Couleurs des points (jamais bleu/violet) : Emerald, Coral, Amber, Rose, Mint.
- Glassmorphism (TopBar, victory overlay), animations Reanimated, dots
  pulsants en arrière-plan, halo rotatif lors de la victoire.

## Limitations connues V1
- Pas de musique d'ambiance bundlée (toggle prêt côté UI/state).
- AdMob mockée (intégration native après déploiement).
- Pas de leaderboard global (cloud sync prêt côté schéma).
