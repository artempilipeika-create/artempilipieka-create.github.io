from backend.v2.cabinet_service import STATUS, NEXT_STEP

def test_production_states_have_truthful_client_labels_and_next_actions():
    assert STATUS['in_production']=='В производстве'
    assert STATUS['ready']=='Готов к выдаче'
    assert STATUS['issued']=='Выдан'
    for state in STATUS:
        assert NEXT_STEP[state]
    assert 'проверит' not in NEXT_STEP['completed']
    assert 'проверит' not in NEXT_STEP['cancelled']
