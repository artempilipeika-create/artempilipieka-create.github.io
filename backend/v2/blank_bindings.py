"""Validate persisted shelf relationships independently of the browser."""

from .assistant_model import ROD_CATALOGUE


def local_point(item, rotation):
    x, z = item.x, item.z
    return {0: (x, z), 90: (z, -x), 180: (-x, -z), 270: (-z, x)}[rotation]


def validate_bindings(items):
    if not any(item.blank_binding for item in items):
        return
    by_id = {item.item_id: item for item in items}
    if len(by_id) != len(items):
        raise ValueError('Идентификаторы деталей с привязками должны быть уникальны.')
    for item in items:
        binding = item.blank_binding
        if not binding:
            continue
        left, right = by_id.get(binding.left_id), by_id.get(binding.right_id)
        if (not left or not right or left is right or any(
                support.module_type != 'blank' or support.blank_axis != 'side' or support.blank_binding
                for support in (left, right))):
            raise ValueError('Для полки нужны две разные боковые стойки.')
        if item.rotation != left.rotation or left.rotation != right.rotation:
            raise ValueError('Поворот полки должен совпадать с поворотом обеих стоек.')
        lx, lz = local_point(left, item.rotation)
        rx, rz = local_point(right, item.rotation)
        start = lx + left.width / 2 + binding.gap_left_mm
        end = rx - right.width / 2 - binding.gap_right_mm
        x, z = local_point(item, item.rotation)
        if item.blank_length_mm != end - start or x != (start + end) / 2 or z != lz + binding.depth_offset_mm:
            raise ValueError('Длина или положение полки не соответствует привязке к стойкам.')
        if binding.gola_flush:
            prefix=item.item_id.rsplit(':',1)[0]+':'
            side=by_id.get(prefix+'left')
            if (not side or side.rotation!=item.rotation or not all(s.item_id.startswith(prefix) for s in (left,right)) or
                    abs(z+item.depth/2-local_point(side,item.rotation)[1]-side.depth/2)>.001):
                raise ValueError('Полка над Gola должна доходить до переднего торца боковины.')
        for support, center_z in ((left, lz), (right, rz)):
            if (z - item.depth / 2 < center_z - support.depth / 2 or
                    (not binding.gola_flush and z + item.depth / 2 > center_z + support.depth / 2) or
                    z - item.depth / 2 >= center_z + support.depth / 2 or
                    (item.elevation_mm or 0) < (support.elevation_mm or 0) or
                    (item.elevation_mm or 0) + item.height > (support.elevation_mm or 0) + support.height):
                raise ValueError('Полка выходит за глубину или высоту опорной стойки.')

    for roof in items:
        cabinet=roof.assistant_carcass
        if not cabinet or not cabinet.spec.rods or roof.item_id!=str(cabinet.group_id)+':top' or not cabinet.spec.has_grip_at_shelf():
            continue
        spec=cabinet.spec
        prefix=str(cabinet.group_id)+':'
        for rod in spec.rods:
            key=f'shelf-{rod.section}-'
            origin=roof.elevation_mm+roof.height-spec.height
            bottom,top=spec.niche_bounds(rod.section,True)[rod.level]
            low,high=origin+bottom,origin+top
            lower=by_id.get(prefix+key+str(rod.level-1))
            upper=by_id.get(prefix+key+str(rod.level))
            if lower:low=lower.elevation_mm+lower.height
            if upper:high=upper.elevation_mm
            if rod.column is not None:
                column=f'{prefix}shelf-niche-{rod.section}-{rod.level}-{rod.column}-'
                below=by_id.get(column+str(rod.opening-1))
                above=by_id.get(column+str(rod.opening))
                if below:low=below.elevation_mm+below.height
                if above:high=above.elevation_mm
            axis=high-rod.offset if rod.anchor=='top' else low+rod.offset
            min_y,max_y,*_=ROD_CATALOGUE[rod.article]['bounds']
            if axis+min_y<low or axis+max_y>high:
                raise ValueError('Держатель штанги выходит за границы установленной полки.')
