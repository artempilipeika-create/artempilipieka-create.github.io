"""Offline texture matching. Never change catalogue identities or merge finishes."""
import re
import unicodedata
from pathlib import PureWindowsPath
from functools import lru_cache

LOOKALIKE = str.maketrans('АВЕКМНОРСТХУ', 'ABEKMHOPCTXY')
EXTRA = r'[DFMSU]\.\d{3}\.(?:[A-Z]\d{2}|[A-Z]{2})'
STOCK = re.compile(r'^(LNEDS|TNEDS|TNWDS|TREDS|TRWDS)(\d{2})(' + EXTRA + r')$')

@lru_cache(maxsize=16384)
def norm(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', str(value or '')).strip()).upper()

def code_text(value):
    return norm(value).translate(LOOKALIKE)

@lru_cache(maxsize=8192)
def brand(value):
    s = norm(value)
    for key, pattern in (
        ('ULTRADECOR', r'ULTRADECOR'), ('SWISS_KRONO', r'SWISS.?KRONO'),
        ('KRONOSPAN', r'KRONOSPAN|КРОНОСПАН|КРОНОШПАН'),
        ('EGGER', r'EGGER'), ('BYSPAN', r'BYSPAN|BAYSPAN'),
        ('EXTRAVERT', r'EXTRAVERT|ЭКСТРАВЕРТ'), ('SENOSAN', r'SENOSAN'),
        ('EVOGLOSS', r'EV[AO]GL[OA]SS?|ЭВОГЛОСС'), ('EVOSOFT', r'EV[AO]SOFT'),
        ('ULTRAMATT', r'ULTRAMATT?'), ('BMATT', r'B\.?MAT+'), ('AGT', r'AGT'),
        ('SLOTEX', r'SLOTEX'), ('KEDR', r'КЕДР')):
        if re.search(pattern, s):
            return key
    return None

@lru_cache(maxsize=8192)
def image_brand(path):
    # A brand explicitly written in the filename is more specific than an old folder name.
    return brand(PureWindowsPath(path).stem) or brand(path)

def without_thickness(article):
    s = norm(article)
    s = re.sub(r'\s*\((?:LT[_\s]*)?\d+(?:[.,]\d+)?\s*(?:ММ|MM)?\)\s*$', '', s)
    return re.sub(r'\s+\d+(?:[.,]\d+)?\s*(?:ММ|MM)\s*$', '', s).strip()

def extra_codes(value):
    s = code_text(value)
    s = re.sub(r'([DFMSU]\.\d{3})\s+(?=[A-Z])', r'\1.', s)
    return set(re.findall(r'(?<![A-Z0-9])(' + EXTRA + r')(?![A-Z0-9])', s))

def decor_code(article, maker):
    s = code_text(without_thickness(article))
    if maker == 'EGGER':
        s = re.sub(r'^DSP\s+', '', s)
        m = re.fullmatch(r'(A?[HUFW]\d{3,4})\s*(ST\d{1,2}|SM|HG|PM)', s)
    elif maker == 'BYSPAN':
        m = re.fullmatch(r'(\d{3,4})\s*(SWN|SWO|SWM|WML|PO|PE|SM|TM)', s)
    elif maker in ('ULTRADECOR', 'KRONOSPAN'):
        m = re.fullmatch(r'(K\d{3}|\d{3,4})\s*([A-Z]{2})', s)
    elif maker == 'SENOSAN':
        m = re.fullmatch(r'(\d{4,5})\s*(TOPMATT|TOPX)', s)
    elif maker == 'EVOGLOSS':
        m = re.fullmatch(r'(P\d{3})', s)
    elif maker == 'BMATT':
        m = re.fullmatch(r'B[ .-]?M[ .-]?0?(\d{1,2})', s)
        return 'BM' + m.group(1).zfill(2) if m else None
    else:
        return None
    return ' '.join(m.groups()) if m else None

def image_codes(image, maker):
    return _image_codes(image['source_relative_path'], maker)

@lru_cache(maxsize=32768)
def _image_codes(path, maker):
    s = code_text(PureWindowsPath(path).stem)
    if maker == 'EXTRAVERT':
        return extra_codes(s)
    patterns = {
        'EGGER': r'(?<![A-Z0-9])(A?[HUFW]\d{3,4})[ _-]*(ST\d{1,2}|SM|HG|PM)(?![A-Z0-9])',
        'BYSPAN': r'(?<![A-Z0-9.])(\d{3,4})[ _-]*(SWN|SWO|SWM|WML|PO|PE|SM|TM)(?![A-Z0-9])',
        'ULTRADECOR': r'(?<![A-Z0-9])(K\d{3}|\d{3,4})[ _-]*([A-Z]{2})(?![A-Z0-9])',
        'KRONOSPAN': r'(?<![A-Z0-9])(K\d{3}|\d{3,4})[ _-]*([A-Z]{2})(?![A-Z0-9])',
        'SENOSAN': r'(?<![A-Z0-9])(\d{4,5})[ _-]*(TOPMATT|TOPX|TX)(?![A-Z0-9])',
        'EVOGLOSS': r'(?<![A-Z0-9])(P\d{3})(?![A-Z0-9])',
    }
    if maker == 'BMATT':
        code = decor_code(s, maker)
        return {code} if code else set()
    if maker not in patterns:
        return set()
    found = re.findall(patterns[maker], s)
    return {' '.join(x if isinstance(x, tuple) else (x,)).replace(' TX', ' TOPX') for x in found}

def candidates(row, images):
    # The catalogue's thickness/prefix can differ, but both article and name must
    # carry the identical complete decor + finish before sharing a scan.
    maker = row[0] or brand(row[2])
    article = norm(row[1]); stock = STOCK.fullmatch(article)
    if stock:
        if maker not in (None, 'EXTRAVERT') or stock[3] not in extra_codes(row[2]):
            return [], 'stock_identity_conflict', []
        if float(row[8]) != int(stock[2]):
            return [], 'stock_thickness_conflict', []
        maker, code, method = 'EXTRAVERT', stock[3], 'stock_article_name_decor_finish'
    else:
        code = decor_code(row[1], maker)
        method = 'same_brand_full_decor_finish'
    hits = []; conflicts = []
    for im in images:
        ib = image_brand(im['source_relative_path'])
        exact = article and norm(im['article_candidate']) == article
        match = (code is not None and code in image_codes(im, maker)) or exact
        if not match:
            continue
        if maker and ib and maker != ib:
            conflicts.append(im['source_relative_path']); continue
        if not exact and maker in ('SENOSAN', 'EVOGLOSS', 'BMATT') and ib != maker:
            continue
        hits.append(im)
    return hits, method if code else 'exact_full_article_filename', conflicts

def choose(hits):
    if not hits:
        return None
    # Equality of decoded pixels, not a perceptual "looks similar" threshold.
    signatures = {(im['width'], im['height'], im.get('rgba_sha256', im['rgb_sha256'])) for im in hits}
    if len(signatures) != 1:
        return None
    return min(hits, key=lambda im: (len(im['source_relative_path']), im['source_relative_path']))
