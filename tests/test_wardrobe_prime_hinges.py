import pytest
from pydantic import ValidationError
from backend.v2.assistant_model import DoorHingeSetting
from backend.v2.three_d_document import _panel_hardware


def test_hinge_catalogue_installation_and_customer_hardware():
    for value in [{'article':'113401'}, {'article':'113403','recess':2}, {'article':'112650','push':True}]:
        with pytest.raises(ValidationError):
            DoorHingeSetting.model_validate(value)
    setting=DoorHingeSetting(article='112712',recess=20,push=True).model_dump(exclude_none=True)
    panel={'item_id':'g:door-right','blank_axis':'front','width':480,'height':1811,
           'assistant_carcass':{'group_id':'g','spec':{'front':{'hinges':{'door-right':setting}}}}}
    rows,_=_panel_hardware(panel)
    assert {r['article']:r['qty'] for r in rows}=={'112712':4,'09.0019':1,'09.0020':1,'09.0021':1}
    del panel['assistant_carcass']['spec']['front']['hinges']
    panel['assistant_carcass']['spec']['front']['swing']='pair'
    rows,_=_panel_hardware(panel)
    assert [(r['article'],r['qty']) for r in rows]==[('112595',4)]


@pytest.mark.parametrize(('article','replacement'),[('122555','112706'),('122556','112703'),('122557','112710')])
@pytest.mark.parametrize('push',[True,{'article':'70787','mount':'surface'},{'article':'82722','mount':'bored'}])
def test_existing_reverse_spring_push_settings_keep_the_mount_and_use_the_same_springless_hinge_in_the_specification(article,replacement,push):
    values={'article':article,'push':push}
    if article=='122557':
        values.update(recess=11,central=True)
    setting=DoorHingeSetting.model_validate(values)
    assert setting.article==replacement
    assert DoorHingeSetting(article=article).article==article
    assert (setting.recess,setting.central)==(values.get('recess'),values.get('central'))
    panel={'item_id':'g:door-right','blank_axis':'front','width':480,'height':1811,
           'assistant_carcass':{'group_id':'g','spec':{'front':{'hinges':{'door-right':values}}}}}
    rows,_=_panel_hardware(panel)
    assert (rows[0]['article'],rows[0]['qty'])==(replacement,4)


@pytest.mark.parametrize('opening',['swing','lift'])
def test_upper_purchase_list_uses_exact_push_article_and_records_unconfirmed_hardware(opening):
    spec={'surround':{'upper':{'opening':opening,'push':{'article':'72258'}}}}
    for side in ('left','right'):
        panel={'item_id':'g:mezz-door-'+side,'blank_axis':'front','assistant_carcass':{'group_id':'g','spec':spec}}
        rows,note=_panel_hardware(panel)
        assert [(r['article'],r['qty']) for r in rows]==[('72258',1)]
        assert 'Беспружинные петли' in note
        assert ('газлифт' in note)==(opening=='lift')
