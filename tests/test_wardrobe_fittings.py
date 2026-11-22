import pytest
from pydantic import ValidationError
from backend.v2.assistant_model import CarcassDesign
from backend.v2.three_d_document import hardware_for

SPEC = dict(recipe='shelves',width=600,height=2200,depth=580,thickness=18,shelves=0,sections=1,
            sectionShelves=[0],back=True,elevation=0,shelfSetback=1,shelfGap=0,
            edgeThickness=1,edgePolicy='front',clearLayout=True)


def test_saved_fittings_purchase_the_correct_stock_holders_and_door_parts():
    fame=dict(id='rail',variant='113749-side',section=0,level=0,offset=100)
    design=CarcassDesign(**SPEC,fittings=[fame],front=dict(swing='right',offset=90,autoHinges=True),
                         doorFittings={'door-right':dict(variant='83332',quantity=2)}).model_dump()
    assert design['fittings']==[fame]
    def purchase(key):
        rows,_=hardware_for(dict(module_type='blank',item_id='qa:'+key,assistant_carcass=dict(group_id='qa',spec=design)))
        return {r['article']:r['qty'] for r in rows if r.get('article') in ('113749','113741','83332','113748','113740')}
    assert purchase('top')=={'113749':1,'113741':2}
    assert purchase('door-right')=={'83332':2}
    assert purchase('left')=={}
    for bad in [dict(fame,variant='unknown'),dict(fame,variant='111049'),dict(fame,level=1),
                dict(fame,variant='123795'),dict(fame,column=1,opening=0)]:
        with pytest.raises(ValidationError):
            CarcassDesign(**SPEC,fittings=[bad])
    with pytest.raises(ValidationError):
        CarcassDesign(**SPEC,doorFittings={'door-left':dict(variant='111049',quantity=1)})
