"""Unit tests for the genre rollup taxonomy.

The test cases lean on tricky real-world Spotify genre strings rather than
straw-man clean inputs — that's where the ordered-rule contract actually
gets tested.
"""

from __future__ import annotations

import pytest

from core.genres import OTHER, classify


@pytest.mark.parametrize(
    "tags, expected",
    [
        # Straightforward cases
        (["pop"], "pop"),
        (["rock"], "rock"),
        (["jazz"], "jazz"),
        # Cross-bucket priority: "hip hop" must beat "pop"
        (["hip hop", "pop rap"], "hip-hop"),
        (["pop rap", "hip hop"], "hip-hop"),
        # Specificity within bucket: "neo-soul" maps to R&B, not pop
        (["neo-soul"], "r-and-b-soul"),
        (["lo-fi r&b"], "r-and-b-soul"),
        # "indietronica" should hit electronic, not catch some generic indie
        (["scandinavian indietronica"], "electronic"),
        # "drill" maps to hip-hop
        (["drill", "uk drill"], "hip-hop"),
        # "k-pop" lands in pop despite the hyphen
        (["k-pop"], "pop"),
        # "shoegaze" → rock
        (["shoegaze"], "rock"),
        # Metal vs rock — metalcore must hit metal
        (["metalcore", "alternative metal"], "metal"),
        # Latin
        (["reggaeton"], "latin"),
        (["salsa", "latin pop"], "latin"),
        # Classical
        (["baroque", "classical performance"], "classical"),
        # Folk
        (["singer-songwriter"], "folk-singer-songwriter"),
        (["indie folk", "americana"], "folk-singer-songwriter"),
        # Empty input → other
        ([], OTHER),
        # No match → other
        (["jibberish-not-a-genre"], OTHER),
    ],
)
def test_classify_returns_expected_bucket(tags, expected):
    bucket, _ = classify(tags)
    assert bucket == expected


def test_classify_returns_unmapped_tags_for_other():
    """Tags that match no rule must come back as unmapped so the caller
    can log them to GenreUnmapped for the feedback loop."""
    bucket, unmapped = classify(["nonsense-genre", "another-nonsense"])
    assert bucket == OTHER
    assert set(unmapped) == {"nonsense-genre", "another-nonsense"}


def test_classify_partial_unmapped_when_some_tags_match():
    bucket, unmapped = classify(["pop", "made-up-microgenre"])
    assert bucket == "pop"
    assert unmapped == ["made-up-microgenre"]


def test_classify_is_deterministic_regardless_of_tag_order():
    """First *rule* in priority order wins, so reordering the artist's
    tags must not change the bucket."""
    a = classify(["hip hop", "pop", "rock"])[0]
    b = classify(["rock", "pop", "hip hop"])[0]
    c = classify(["pop", "hip hop", "rock"])[0]
    assert a == b == c == "hip-hop"


def test_classify_is_case_insensitive():
    assert classify(["POP"])[0] == "pop"
    assert classify(["Hip-Hop"])[0] == "hip-hop"


@pytest.mark.django_db
def test_log_unmapped_creates_and_increments_hit_counts():
    from core.genres import log_unmapped
    from core.models import GenreUnmapped

    log_unmapped(["weird-tag-1", "weird-tag-2"])
    log_unmapped(["weird-tag-1", "weird-tag-3"])

    by_tag = {g.tag: g.hit_count for g in GenreUnmapped.objects.all()}
    assert by_tag == {
        "weird-tag-1": 2,
        "weird-tag-2": 1,
        "weird-tag-3": 1,
    }
