"""Saved material identities select PDF samples without network calls or new renders."""
import base64
from contextlib import contextmanager
from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image
from pypdf import PdfReader

from backend.v2 import album_materials, kitchen_album, material_visuals


def image():
    out = BytesIO()
    Image.new('RGB', (600, 400), '#b9aa8b').save(out, 'JPEG')
    return out.getvalue()


def specimen():
    return {'items': [{'item_id': 'test', 'module_type': 'base_cabinet',
                      'body_variant_id': 'body', 'front_variant_id': 'front',
                      'plinthMaterialId': 'plinth', 'countertopMaterialId': 'stone'}]}


def test_real_catalogue_and_archived_user_samples_are_available():
    visual = material_visuals.visual_metadata({'article': 'H1180 ST37', 'manufacturer': 'EGGER'})
    result = album_materials.sample(visual)
    assert result['label'] == 'Текстура материала'
    assert max(Image.open(BytesIO(result['image'])).size) <= 320
    ident, record = next(iter(material_visuals.user_textures()['variants'].items()))
    selected = {**record, 'variant_id': ident}
    user = material_visuals.visual_metadata(selected)
    assert album_materials.sample(user)['image']
    # The same UUID must never attach a texture to a different imported identity.
    assert material_visuals.exact_user_texture({**selected, 'article': 'different'}) is None


def test_preview_color_and_missing_texture_are_distinguished():
    preview = material_visuals.visual_metadata({'manufacturer': 'BYSPAN', 'article': '605 PO'})
    assert album_materials.sample(preview)['label'] == 'Образец, без текстуры'
    assert album_materials.sample(preview)['image']
    assert album_materials.sample({'render_color': '#123456'}) == {
        'image': None, 'color': '#123456', 'label': 'Цвет, без текстуры'}
    assert album_materials.sample({'render_color': 'red'})['label'] == 'Текстура не добавлена'


@pytest.mark.parametrize('url', ['https://example.com/image.jpg', 'file:///secret.png',
    '/account/planner/materials/../secret.png', '/account/planner/other.jpg',
    '/account/planner/materials/not-registered.jpg'])
def test_samples_never_read_unregistered_paths_or_external_urls(url, monkeypatch):
    monkeypatch.setattr(material_visuals, 'user_texture_bytes', lambda _: pytest.fail('Must not read'))
    assert album_materials.thumbnail(url) is None


def test_missing_and_corrupt_registered_files_fall_back_without_breaking_pdf(tmp_path, monkeypatch):
    monkeypatch.setattr(material_visuals, 'ROOT', tmp_path)
    url = material_visuals.manifest()['decors']['U708 ST9']['texture_url']
    album_materials.thumbnail.cache_clear()
    try:
        assert album_materials.sample({'texture_url': url})['image'] is None
        asset = material_visuals.manifest()['decors']['U708 ST9']['asset']
        (tmp_path/asset).write_bytes(b'wrong bytes')
        album_materials.thumbnail.cache_clear()
        assert album_materials.sample({'texture_url': url})['image'] is None
    finally:
        album_materials.thumbnail.cache_clear()


def test_page_three_keeps_mixed_decors_names_and_their_samples():
    scene = specimen()
    scene['items'].append({**scene['items'][0], 'item_id': 'second', 'front_variant_id': 'accent'})
    names = {'body': 'Корпус белый 605 PO', 'front': 'Фасад дуб H1180 ST37',
             'accent': 'Фасад однотонный', 'plinth': 'Цоколь выбран', 'stone': 'Столешница выбрана'}
    visuals = {
        'body': material_visuals.visual_metadata({'manufacturer': 'BYSPAN', 'article': '605 PO'}),
        'front': material_visuals.visual_metadata({'manufacturer': 'EGGER', 'article': 'H1180 ST37'}),
        'accent': {'render_color': '#19382e'}}
    pdf = PdfReader(BytesIO(kitchen_album.render('Кухня', scene, names, image(), material_visuals=visuals)))
    assert len(pdf.pages) == 4
    page = pdf.pages[2]
    text = page.extract_text()
    assert all(name in text for name in names.values())
    assert all(label in text for label in ['Образец, без текстуры', 'Текстура материала',
                                          'Цвет, без текстуры', 'Текстура не добавлена'])
    assert len(page.images) == 2
    assert 'Общий вид проекта' in pdf.pages[1].extract_text()


def test_album_route_uses_saved_catalogue_visuals_and_never_requests_a_photo(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from backend.v2 import three_d_api as api
    pid, mid, release = uuid4(), uuid4(), uuid4()
    row = {'version': 3, 'name': 'Кухня', 'scene': {'items': [{
        'item_id': 'unit', 'module_type': 'base_cabinet', 'front_variant_id': str(mid)}]}}
    material = {'variant_id': str(mid), 'kind': 'material', 'manufacturer': 'EGGER',
                'article': 'H1180 ST37', 'name': 'Дуб натуральный'}
    class Connection:
        def execute(self, sql, params):
            if 'mf_catalogue_items' in sql:
                assert params == (release, mid)
                self.found = {'snapshot': material}
            else:
                assert 'owner_user_id' in sql and params == (pid, 'owner')
                self.found = row
            return self
        def fetchone(self): return self.found
    @contextmanager
    def transaction(_): yield Connection()
    monkeypatch.setattr(api, 'transaction', transaction)
    monkeypatch.setattr(api, 'identity', lambda *a: {'user_id': 'owner'})
    monkeypatch.setattr(api, 'require', lambda *a: None)
    monkeypatch.setattr(api.catalogue, 'active', lambda *a: release)
    monkeypatch.setattr(api.sales_render, 'generate', lambda *a: pytest.fail('No paid render'))
    app = FastAPI(); app.include_router(api.router(None))
    encoded = 'data:image/jpeg;base64,' + base64.b64encode(image()).decode()
    with TestClient(app) as client:
        response = client.post(f'/api/v2/3d-projects/{pid}/sales-album.pdf', json={
            'version': 3, 'layout': 'client', 'hero_data_url': encoded, 'photo': False})
    assert response.status_code == 200, response.text
    pdf = PdfReader(BytesIO(response.content))
    assert len(pdf.pages) == 4 and len(pdf.pages[2].images) == 1
    assert 'Дуб натуральный' in pdf.pages[2].extract_text()
