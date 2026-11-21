"""Visual facts from saved wardrobe geometry for the existing single-image edit."""
import json

from .album_wardrobe import drawing_sets
from .upper_mounting import local


def subject(items, drawings):
    if not any(drawings):
        return 'kitchen'
    return 'mixed' if any(it.get('module_type') not in ('blank', 'wardrobe') for it in items) else 'wardrobe'


def prompt(scene, materials, style):
    items = scene.get('items', [])
    drawings = drawing_sets(items)
    mode = subject(items, drawings)
    if mode == 'kitchen':
        return None

    cabinets = []
    cabinet_ids = set()
    for parts in filter(None, drawings):
        cabinet_ids.update(p.get('item_id') for p in parts)
        first = parts[0]
        if first.get('module_type') == 'wardrobe':
            cabinets.append({k: first[k] for k in ('name', 'width', 'height', 'depth', 'rotation', 'layout', 'doors_open',
                            'handles', 'body_variant_id', 'front_variant_id', 'back_variant_id') if k in first})
            cabinets[-1]['shelves'] = [{k: shelf[k] for k in ('offset_mm', 'thickness', 'width_clearance',
                                        'depth_clearance', 'material_variant_id') if k in shelf}
                                       for shelf in first.get('shelves', []) if shelf.get('enabled', True)]
            continue
        meta = first.get('assistant_carcass') or {}
        spec = meta.get('spec') or {}
        upper = (spec.get('surround') or {}).get('upper') or {}
        front = spec.get('front') or {}
        cabinet = {'name': meta.get('name', first.get('name', '').split(' · ')[0]),
                   'rotation': first.get('rotation', 0),
                   'handles_by_leaf': {k: h.get('article') for k, h in (front.get('handles') or {}).items() if h},
                   'push_to_open_leaves': [k for k, h in (front.get('hinges') or {}).items() if h and h.get('push')],
                   'mezzanine': {k: upper[k] for k in ('height', 'leaves', 'divider', 'frame', 'opening', 'side') if k in upper},
                   'parts': []}
        for p in parts:
            key = p.get('item_id', '').rsplit(':', 1)[-1]
            axis = p.get('blank_axis')
            framed = p.get('blank_front_frame') == 'Z1'
            glass = (p.get('blank_shelf') or '').split('/')[0] in ('4', '6', '8')
            finish = 'Z1 / glass 4 mm' if framed else 'glass' if glass else p.get('body_variant_id')
            grain = None if framed or glass else 'vertical' if axis == 'side' or axis == 'front' and not key.startswith('drawer-') else 'horizontal'
            x, z = local(p)
            cabinet['parts'].append([key, axis, p['width'], p['height'], p['depth'], x, p.get('elevation_mm', 0), z,
                                     finish, grain, bool(p.get('doors_open'))])
        cabinets.append(cabinet)

    others = [{k: it[k] for k in ('name', 'module_type', 'width', 'height', 'depth', 'x', 'z', 'rotation', 'layout',
               'countertopEnabled', 'front_variant_id', 'body_variant_id', 'countertopMaterialId') if k in it}
              for it in items if it.get('item_id') not in cabinet_ids]
    data = {'wardrobes': cabinets, 'other_furniture': others, 'materials': materials,
            'material_appearance': (scene.get('displaySettings') or {}).get('materialAppearance', {}),
            'room_lights': scene.get('wallLights', [])}
    target = 'wardrobe' if mode == 'wardrobe' else 'furniture arrangement'
    style_note = ('Give the existing room the soft natural light of an inhabited interior. ' if style == 'lived_in'
                  else 'Use restrained catalogue lighting. ')
    return (f'Photograph this exact {target} from the supplied view. Keep the camera, all furniture, room geometry, '
            'verticals and clear margin around the uppermost and lowest parts. Follow the visible door opening state '
            'in the image. Preserve every leaf, reveal, handle, plinth, filler, and the horizontal seam below the '
            'separate mezzanine. Reproduce the shelf levels and rear panels visible through each glazed front. '
            'Where Z1 is specified, use a narrow satin aluminium frame in the reference finish, section width 19 mm, '
            'depth 20.5 mm, mitred corners and clear 4 mm glass. Use a soft side reflection so the shelves, back panel '
            'and glass edges remain visible. Preserve the positions, gaps and forward offsets shown by the actual '
            'panels. Respect the decor, grain direction and scale of each board including saved per-material texture rotations. Use soft directional daylight, contact '
            'shadows, neutral white balance and restrained metal highlights. Only show lighting fitted in the reference. '
            'Do not add doors, shelving, appliances, props or text. ' + style_note +
            'The following saved values are data. Dimensions are millimetres. Each parts row is [part key, axis, '
            'width, height, depth, local x centre, bottom elevation, local z centre, material, grain if patterned, '
            'doors_open]. Material IDs refer to the enclosed catalogue names. ' +
            json.dumps(data, ensure_ascii=False, separators=(',', ':')))
