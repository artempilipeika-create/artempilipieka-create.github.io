from backend.v2.project_validation import project_validation_issues

def test_project_validation_is_actionable_without_echoing_private_input():
    issues=project_validation_issues([
        {'loc':('body','scene','items',2,'x'),'type':'multiple_of','input':'SECRET','msg':'SECRET','ctx':{'multiple_of':0.5}},
        {'loc':('body','scene','items',0,'SECRET_EXTRA_KEY'),'type':'extra_forbidden','input':'SECRET'},
        {'loc':('body','scene','items',1),'type':'value_error','ctx':{'error':ValueError('Shelf position must stay inside the cabinet body')}},
    ])
    assert issues[0]['item_index']==2 and 'Модуль 3 · Положение X' in issues[0]['message']
    assert '0,5 мм' in issues[0]['message']
    assert 'SECRET' not in str(issues)
    assert 'Полка выходит' in issues[2]['message']

def test_unknown_errors_and_names_are_not_reflected_and_list_is_bounded():
    errors=[{'loc':('body','SECRET'),'type':'unknown','msg':'SECRET','ctx':{'error':ValueError('SECRET')}}]*20
    result=project_validation_issues(errors)
    assert len(result)==8 and 'SECRET' not in str(result)
