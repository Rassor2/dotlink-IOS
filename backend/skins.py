"""Dot Link - Skin catalog.

Pricing is anchored to the rewarded-ad coin economy:
  1 ad watched = 50 coins (the in-game reward).

Tier → number of ads to earn → coin price → Stripe USD price (coins / 200).
"""

# Each ad = 50 coins
ADS_TO_COINS = 50

TIERS = {
    "common":     {"ads": 5,   "label": "Commun"},
    "uncommon":   {"ads": 15,  "label": "Peu commun"},
    "rare":       {"ads": 40,  "label": "Rare"},
    "epic":       {"ads": 100, "label": "Épique"},
    "legendary":  {"ads": 250, "label": "Légendaire"},
    "developer":  {"ads": 500, "label": "Développeur"},
}


def _price(tier_key: str) -> dict:
    cfg = TIERS[tier_key]
    coins = cfg["ads"] * ADS_TO_COINS
    # Coins are ~$0.01 each in our packs; charge a tiny premium on Stripe.
    usd = round(max(0.99, coins / 200.0), 2)
    return {
        "tier": tier_key,
        "tier_label": cfg["label"],
        "ads": cfg["ads"],
        "coins": coins,
        "usd": usd,
    }


# Board skins
BOARD_SKINS = [
    {"id": "board_obsidian",  "name": "Obsidienne", "tier": "common",
     "accent": "#262626", "bg": "#0a0a0a", "grid_line": "rgba(255,255,255,0.06)",
     "preview_emoji": "·",
     "description": "Le vide originel. Sobre, parfait pour la concentration."},
    {"id": "board_aurora",    "name": "Voile Aurora", "tier": "uncommon",
     "accent": "#32A852", "bg": "#06140A", "grid_line": "rgba(50,168,82,0.18)",
     "preview_emoji": ":",
     "description": "Le voile émeraude pulse doucement sous chaque trait."},
    {"id": "board_solaris",   "name": "Solaris", "tier": "rare",
     "accent": "#F5C851", "bg": "#1A1305", "grid_line": "rgba(245,200,81,0.20)",
     "preview_emoji": "*",
     "description": "Or fondu, brille comme le coeur d'une étoile."},
    {"id": "board_nebula",    "name": "Nébuleuse", "tier": "epic",
     "accent": "#E91E63", "bg": "#1A0710", "grid_line": "rgba(233,30,99,0.22)",
     "preview_emoji": "✶",
     "description": "Rose stellaire — chaque cellule respire."},
    {"id": "board_void",      "name": "Vide profond", "tier": "legendary",
     "accent": "#FF7F50", "bg": "#0D0703", "grid_line": "rgba(255,127,80,0.22)",
     "preview_emoji": "⌖",
     "description": "Là où les Tisseurs déposent leur dernière lumière."},
    {"id": "board_devmatrix", "name": "Matrice Dev", "tier": "developer",
     "accent": "#98FF98", "bg": "#000000", "grid_line": "rgba(152,255,152,0.30)",
     "preview_emoji": "⌬",
     "description": "Réservé aux artisans. Une grille technique éblouissante."},
]

# Ball / dot skins
BALL_SKINS = [
    {"id": "ball_classic",   "name": "Classique", "tier": "common",
     "style": "solid", "ring_opacity": 0.25, "glow": 0.6,
     "description": "Une sphère lisse, comme à l'origine."},
    {"id": "ball_halo",      "name": "Halo", "tier": "uncommon",
     "style": "halo",  "ring_opacity": 0.55, "glow": 0.85,
     "description": "Un anneau cosmique entoure chaque étoile."},
    {"id": "ball_pulse",     "name": "Pulse", "tier": "rare",
     "style": "pulse", "ring_opacity": 0.40, "glow": 1.0,
     "description": "Battement lent — l'étoile respire."},
    {"id": "ball_prism",     "name": "Prisme", "tier": "epic",
     "style": "prism", "ring_opacity": 0.6, "glow": 1.0,
     "description": "Bordure prismatique aux reflets liquides."},
    {"id": "ball_supernova", "name": "Supernova", "tier": "legendary",
     "style": "supernova", "ring_opacity": 0.7, "glow": 1.2,
     "description": "Couronne éclatante — l'apogée du tissage."},
    {"id": "ball_devcore",   "name": "Noyau Dev", "tier": "developer",
     "style": "devcore", "ring_opacity": 0.9, "glow": 1.3,
     "description": "Noyau hexagonal. Énergie pure."},
]


def get_all_skins():
    boards = [{**s, **_price(s["tier"])} for s in BOARD_SKINS]
    balls = [{**s, **_price(s["tier"])} for s in BALL_SKINS]
    return {"board": boards, "ball": balls}


def find_skin(skin_id: str):
    for s in BOARD_SKINS + BALL_SKINS:
        if s["id"] == skin_id:
            return {**s, **_price(s["tier"])}
    return None
