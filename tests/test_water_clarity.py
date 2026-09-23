from copy import deepcopy

from backend import logbook_store
from backend.backend_config import DEFAULT_LOGBOOK


def test_v2_default_clarity_has_no_retired_algae_bloom_option() -> None:
    document = deepcopy(DEFAULT_LOGBOOK)
    assert "Algae Bloom" not in document["waterClarities"]
    assert "Muddy" in document["waterClarities"]
    assert logbook_store.validate_logbook(document) == (True, None)
