"""Exact decimal arithmetic and canonical snapshots. No browser financial authority."""
import json
import hashlib
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

ROUNDING_VERSION='BYN-line-half-up-0.01-category-discount-v1'
CATEGORIES=('materials','edge_material','services')

def dec(value):
    if isinstance(value,(float,bool)) or value is None:
        raise ValueError('Decimal string or integer required')
    d=Decimal(value)
    if not d.is_finite(): raise ValueError('Finite decimal required')
    return d

def money(value):
    return dec(value).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)

def plain(value):
    if isinstance(value,Decimal): return format(value,'f')
    if isinstance(value,UUID): return str(value)
    if isinstance(value,(date,datetime)): return value.isoformat()
    if isinstance(value,dict): return {str(k):plain(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)): return [plain(v) for v in value]
    if isinstance(value,float): raise ValueError('Float in financial snapshot')
    return value

def canonical(value):
    return json.dumps(plain(value),ensure_ascii=False,sort_keys=True,separators=(',',':'))

def hash_value(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()

def category_totals(lines,discounts):
    out={}
    for cat in CATEGORIES:
        gross=sum((dec(l['gross']) for l in lines if l['category']==cat and l['gross'] is not None),Decimal(0))
        percent=dec(discounts[cat]) if discounts is not None else None
        discount=money(gross*percent/100) if percent is not None else None
        out[cat]={'gross':money(gross),'percent':percent,'discount':discount,
                  'net':money(gross-discount) if discount is not None else None,
                  'complete':percent is not None and all(l['state']=='complete' for l in lines if l['category']==cat)}
    return plain(out)
