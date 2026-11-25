"""Resolve board-drilling profiles for one unaggregated purchase row and its scene item."""
import re


def _normal(value):
    value = str(value or "").lower().replace("ё", "е").replace("×", "x").replace("х", "x")
    return " ".join(value.replace("\xa0", " ").split())


def _joint(name):
    if re.fullmatch(r"конф[ие]рмат\s+7\s*x\s*50(?:\s*мм)?(?:\s*[,·]\s*zn)?", name):
        return "joint:confirmat"
    if re.fullmatch(r"эксцентриковая стяжка(?: (?:для плиты )?18\s*мм| · задняя стенка)?", name):
        return "joint:cam"
    return None


def drill_key(item, row, drilling) -> str | None:
    """Return a key whose list is per physical piece, or None if the complete pattern is unverified.

    Inputs use module_hardware(item) rows before merging items; optional native push_install
    and push_part come from the installed door's constructor export. The empty list is meaningful.
    """
    article = str(row.get("article") or "").strip()
    name = _normal(row.get("name"))
    joint = _joint(name)
    if item.get("module_type") != "blank":
        # Purchased components may use different machining in another manufacturer's assembly.
        sha = item.get("bazis_sha256") or ""
        identity = "joint:cam" if joint == "joint:cam" else "joint:confirmat" if joint else article
        if _normal(article) == "05.0360":
            identity = "05.0360:base" if "база" in name else "05.0360:stem" if "ножка" in name else ""
        key = f"module:{sha}:{identity}"
        return key if identity and key in drilling else None

    meta = item.get("assistant_carcass") or {}
    spec = meta.get("spec") or {}
    owner = str(item.get("item_id") or "").removeprefix(str(meta.get("group_id")) + ":")
    is_frame = item.get("blank_front_frame") == "Z1"

    if joint:
        return joint if joint in drilling else None
    if name == "саморез 3,5x18 мм · общая стойка":
        key = "screw:3.5x18:shared"
        return key if key in drilling else None
    if article == "118779":
        surface = "face" if owner == "bottom" else "end" if owner in {"left", "right"} or re.fullmatch(r"divider-\d+", owner) else None
        key = f"foot:{article}:{surface}"
        return key if surface and key in drilling else None
    if article == "12867" and not owner.startswith("drawer-"):
        # The 5×30 screw in a drawer face or spacer has two verified board operations.
        return None
    if article == "09.0021" and is_frame:
        return "09.0021:z1" if "09.0021:z1" in drilling else None
    frame_key = f"z1:{article}"
    if is_frame and frame_key in drilling:
        return frame_key
    if f"push:{article}:surface" in drilling or f"push:{article}:bored" in drilling:
        # Bored versus surface changes the operations even at the same article and unit price.
        if row.get("push_part") == "catch":
            return "included:native-companion" if "included:native-companion" in drilling else None
        mount = row.get("push_install")
        if mount is None:
            if owner.startswith("mezz-door-"):
                push = (((spec.get("surround") or {}).get("upper") or {}).get("push"))
            else:
                doors = ((spec.get("front") or {}).get("hinges") or {})
                push = (doors.get(owner) or {}).get("push")
            if isinstance(push, dict):
                if push.get("article", "72255") != article:
                    return None
                mount = push.get("mount", "auto")
        if mount in (None, "auto"):
            modes = [m for m in ("surface", "bored") if f"push:{article}:{m}" in drilling]
            if len(modes) != 1:
                return None
            mount = modes[0]
        key = f"push:{article}:{mount}"
        frame_key = key + ":z1"
        if is_frame and frame_key in drilling:
            return frame_key
        return key if key in drilling else None
    return article if article and article in drilling else None
