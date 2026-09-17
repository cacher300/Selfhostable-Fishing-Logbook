from backend import logbook_store


def test_normalization_removes_retired_algae_bloom_option() -> None:
    normalized = logbook_store.normalize_logbook({"waterClarities": ["Muddy", "Algae Bloom"]})

    assert "Algae Bloom" not in normalized["waterClarities"]
    assert "Muddy" in normalized["waterClarities"]
