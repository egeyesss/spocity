"""Genre rollup taxonomy.

Maps Spotify's free-form artist genre tags (often dozens per artist, low-level
microgenres) into the 10 high-level district buckets the city uses. See
decisions.md §1 for the rationale behind the bucket set.

Two responsibilities live here:

1. `BUCKETS`: the canonical bucket definitions (slug, label, color palette).
   The seed migration reads this list — it is the single source of truth so
   the database stays in lockstep with the classifier.

2. `classify(genres)`: takes a list of Spotify genre tags and returns
   `(bucket_slug, unmapped_tags)`. Uses an ordered substring matcher —
   earlier rules win, so more specific rules must be listed first (e.g.,
   "hip hop" before "pop", "neo-soul" doesn't need to come before "soul"
   because they both map to the same bucket).
"""

from __future__ import annotations

OTHER = "other"


# (slug, label, color_palette, sort_order). Slug is the FK in DB; sort_order
# controls display order in the city's mini-map / settings UI.
BUCKETS: list[tuple[str, str, list[str], int]] = [
    ("pop", "Pop", ["#FFD1DC", "#FF69B4", "#C71585"], 1),
    ("hip-hop", "Hip-Hop", ["#FFE599", "#FFC107", "#B8860B"], 2),
    ("r-and-b-soul", "R&B / Soul", ["#D6BCFA", "#9F7AEA", "#553C9A"], 3),
    ("rock", "Rock", ["#FCA5A5", "#EF4444", "#991B1B"], 4),
    ("metal", "Metal", ["#A0AEC0", "#4A5568", "#1A202C"], 5),
    ("electronic", "Electronic", ["#7DD3FC", "#06B6D4", "#0E7490"], 6),
    (
        "folk-singer-songwriter",
        "Folk / Singer-Songwriter",
        ["#BBF7D0", "#22C55E", "#15803D"],
        7,
    ),
    ("classical", "Classical", ["#F5F5DC", "#E8DCC4", "#B8A582"], 8),
    ("jazz", "Jazz", ["#A5B4FC", "#6366F1", "#3730A3"], 9),
    ("latin", "Latin", ["#FED7AA", "#F97316", "#9A3412"], 10),
    (OTHER, "Other", ["#E5E7EB", "#9CA3AF", "#4B5563"], 99),
]


# Ordered substring → bucket rules. First rule that matches any of an
# artist's tags wins. Rules are case-insensitive (the matcher lowercases
# tags). More specific substrings come first within each bucket to keep the
# list readable, but ordering only *matters* across bucket boundaries — for
# example "hip hop" must come before "pop" so "hip hop" doesn't fall into
# the pop district.
GENRE_RULES: list[tuple[str, str]] = [
    # hip-hop comes before pop so "hip hop" / "pop rap" don't fall into pop
    ("hip hop", "hip-hop"),
    ("hip-hop", "hip-hop"),
    ("rap", "hip-hop"),
    ("trap", "hip-hop"),
    ("drill", "hip-hop"),
    # r&b/soul before pop so "neo-soul" / "lo-fi r&b" don't fall into pop
    ("neo soul", "r-and-b-soul"),
    ("neo-soul", "r-and-b-soul"),
    ("r&b", "r-and-b-soul"),
    ("rnb", "r-and-b-soul"),
    ("soul", "r-and-b-soul"),
    ("funk", "r-and-b-soul"),
    # metal before rock so "metalcore" / "death metal" don't fall into rock
    ("metalcore", "metal"),
    ("metal", "metal"),
    # electronic — broad family
    ("electronic", "electronic"),
    ("electronica", "electronic"),
    ("edm", "electronic"),
    ("house", "electronic"),
    ("techno", "electronic"),
    ("dubstep", "electronic"),
    ("drum and bass", "electronic"),
    ("dnb", "electronic"),
    ("ambient", "electronic"),
    ("trance", "electronic"),
    ("downtempo", "electronic"),
    ("indietronica", "electronic"),
    ("synthwave", "electronic"),
    ("vaporwave", "electronic"),
    # classical
    ("classical", "classical"),
    ("baroque", "classical"),
    ("orchestra", "classical"),
    ("opera", "classical"),
    ("symphony", "classical"),
    # jazz
    ("jazz", "jazz"),
    ("bebop", "jazz"),
    ("bossa nova", "jazz"),
    ("swing", "jazz"),
    # folk / singer-songwriter
    ("singer-songwriter", "folk-singer-songwriter"),
    ("singer songwriter", "folk-singer-songwriter"),
    ("folk", "folk-singer-songwriter"),
    ("americana", "folk-singer-songwriter"),
    ("bluegrass", "folk-singer-songwriter"),
    # latin — list specific styles in case bare "latin" tag isn't present
    ("latin", "latin"),
    ("reggaeton", "latin"),
    ("salsa", "latin"),
    ("bachata", "latin"),
    ("cumbia", "latin"),
    ("merengue", "latin"),
    ("mariachi", "latin"),
    # pop — comes last among the "real" buckets so specific tags above win
    ("k-pop", "pop"),
    ("kpop", "pop"),
    ("j-pop", "pop"),
    ("synthpop", "pop"),
    ("synth pop", "pop"),
    ("indie pop", "pop"),
    ("dance pop", "pop"),
    ("pop", "pop"),
    # rock — keep last; "indie rock", "punk rock", "shoegaze" all collapse here
    ("shoegaze", "rock"),
    ("punk", "rock"),
    ("grunge", "rock"),
    ("alternative", "rock"),
    ("indie rock", "rock"),
    ("rock", "rock"),
]


def classify(genres: list[str]) -> tuple[str, list[str]]:
    """Roll up a list of Spotify genre tags into one bucket slug.

    Returns (bucket_slug, unmapped_tags). When no rule matches any tag, the
    bucket is 'other' and every tag is returned as unmapped so the caller
    can log them to GenreUnmapped for the feedback loop.

    The rule order in GENRE_RULES drives priority: the first rule whose
    substring matches any of the artist's tags wins. Tag order is irrelevant.
    """
    if not genres:
        return OTHER, []

    lowered = [g.lower() for g in genres]
    matched_bucket: str | None = None
    matched_tags: set[str] = set()

    for substring, bucket in GENRE_RULES:
        for tag in lowered:
            if substring in tag:
                if matched_bucket is None:
                    matched_bucket = bucket
                matched_tags.add(tag)

    unmapped = [g for g, low in zip(genres, lowered) if low not in matched_tags]
    return matched_bucket or OTHER, unmapped


def log_unmapped(tags: list[str]) -> None:
    """Increment hit counters in GenreUnmapped for tags that hit no rule.

    Imported lazily so this module stays import-safe at app-startup time
    (genres.py is loaded by the seed migration before the ORM is wired).
    """
    if not tags:
        return
    from django.db.models import F
    from .models import GenreUnmapped

    for raw in tags:
        tag = raw.lower().strip()
        if not tag:
            continue
        obj, created = GenreUnmapped.objects.get_or_create(tag=tag)
        if not created:
            GenreUnmapped.objects.filter(pk=obj.pk).update(
                hit_count=F("hit_count") + 1
            )
