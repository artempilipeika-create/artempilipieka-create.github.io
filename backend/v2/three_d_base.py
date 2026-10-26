"""Reviewed replacement for the standard two-door base donor; no name-only fallback."""
BASE_SOURCE_REVISION = {
    'id': 'bazis.3079d0656398',
    'previous': '7d6feef0bc55a52460670eaa9f738c2e9764edd947d52ca4269053fd5fed6d29',
    'current': 'a659d5e7a0da816ef74206ec86c76e09fa3a3c728a7247b80be9bac507b689d2',
    'file': 'НМД2-600.(2).fr3d',
}


def refresh_base_source(item: dict) -> dict:
    # Compatibility entry point. A saved source is immutable until explicit selection.
    return item
