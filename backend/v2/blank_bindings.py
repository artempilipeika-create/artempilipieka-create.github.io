"""Validate persisted shelf relationships independently of the browser."""

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
        for support, center_z in ((left, lz), (right, rz)):
            if (z - item.depth / 2 < center_z - support.depth / 2 or
                    z + item.depth / 2 > center_z + support.depth / 2 or
                    (item.elevation_mm or 0) < (support.elevation_mm or 0) or
                    (item.elevation_mm or 0) + item.height > (support.elevation_mm or 0) + support.height):
                raise ValueError('Полка выходит за глубину или высоту опорной стойки.')
