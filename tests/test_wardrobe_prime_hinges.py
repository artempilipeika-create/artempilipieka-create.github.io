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
