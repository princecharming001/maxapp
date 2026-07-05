"""validator.py — the render-contract, mirrored EXACTLY from
mobile/components/MessageBlocks.tsx and mobile/components/ConfidenceInfoButton.tsx
(both read-only references; ralph-chat never edits mobile/).

Two severities, matched to what actually happens on-device:
  - FAIL  ("crash"): the shape would make RN throw — an object/array/None
    reaching a bare JSX text-child position (`<Text>{leaf}</Text>` with no
    stringification in between). MessageBlocks has NO error boundary, so a
    FAIL here means the entire message row goes blank/crashes for the user.
  - WARN  ("degrade"): the shape renders, but wrong/silently-dropped — e.g. a
    non-list `rows`, more than the 3/4 items mobile slices to, a numeric
    label that LOOKS right but isn't a string.

This module is also the single source of truth backend fixes must match
(RUBRIC.md's shape table is generated from reading this file, not the other
way around) — when the backend gets `_validate_and_normalize_block()`, its
per-type rules should produce shapes that pass THIS validator with zero FAILs.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

ALLOWED_BLOCK_TYPES = {"table", "comparison", "timeline", "flowchart", "stat_cards", "checklist"}


@dataclass
class Violation:
    severity: str  # "fail" | "warn"
    message: str


@dataclass
class ValidationResult:
    violations: list[Violation] = field(default_factory=list)

    @property
    def fails(self) -> list[str]:
        return [v.message for v in self.violations if v.severity == "fail"]

    @property
    def warns(self) -> list[str]:
        return [v.message for v in self.violations if v.severity == "warn"]

    @property
    def ok(self) -> bool:
        return not self.fails


def _is_leaf_renderable(v: Any) -> bool:
    """Would `{v}` as a bare JSX child be safe? True for str/int/float/bool/None
    (RN renders these, None/False as nothing) — False for dict/list (React:
    "Objects are not valid as a React child")."""
    return v is None or isinstance(v, (str, int, float, bool))


def _is_leaf_renderable_strict_str(v: Any) -> bool:
    """Some fields are directly interpolated with `?? ''`/`?? default` — a
    non-string non-null value still WON'T crash (numbers/bools render fine as
    JSX children) but reads wrong on a "this should be prose" field. Used for
    WARN-level type checks, not FAIL."""
    return isinstance(v, str)


def validate_block(block: dict) -> ValidationResult:
    r = ValidationResult()
    if not isinstance(block, dict):
        r.violations.append(Violation("fail", f"block is not a dict: {type(block).__name__}"))
        return r

    btype = block.get("type")
    if btype not in ALLOWED_BLOCK_TYPES:
        r.violations.append(Violation("fail", f"unknown/missing block type: {btype!r}"))
        return r

    title = block.get("title")
    if title is not None and not isinstance(title, str):
        r.violations.append(Violation("warn", f"[{btype}] title is not a string: {type(title).__name__}"))

    data = block.get("data")
    if not isinstance(data, dict):
        r.violations.append(Violation("fail", f"[{btype}] data is not a dict: {type(data).__name__}"))
        return r

    dispatch = {
        "table": _validate_table,
        "comparison": _validate_comparison,
        "timeline": _validate_timeline,
        "flowchart": _validate_flowchart,
        "stat_cards": _validate_stat_cards,
        "checklist": _validate_checklist,
    }
    dispatch[btype](data, r)
    return r


def _validate_table(data: dict, r: ValidationResult) -> None:
    columns = data.get("columns")
    rows = data.get("rows")

    if not isinstance(columns, list) or not columns:
        r.violations.append(Violation("warn", "[table] columns missing/empty/non-list -> block renders nothing (mobile: !columns.length -> return null)"))
        columns = []
    else:
        for i, c in enumerate(columns):
            if isinstance(c, (dict, list)):
                r.violations.append(Violation("fail", f"[table] columns[{i}] is {type(c).__name__} -> <Text> crash"))
            elif not _is_leaf_renderable_strict_str(c):
                r.violations.append(Violation("warn", f"[table] columns[{i}] is {type(c).__name__}, expected str"))

    if not isinstance(rows, list) or not rows:
        r.violations.append(Violation("warn", "[table] rows missing/empty/non-list -> block renders nothing"))
        rows = []
    else:
        for ri, row in enumerate(rows):
            if row is None:
                r.violations.append(Violation("fail", f"[table] rows[{ri}] is None -> `row[ci]` throws (TypeError: Cannot read properties of null)"))
                continue
            if not isinstance(row, list):
                r.violations.append(Violation("warn", f"[table] rows[{ri}] is {type(row).__name__}, not a list -> indexed lookup degrades silently (dict) or produces char-slicing garbage (str)"))
                continue
            if columns and len(row) != len(columns):
                r.violations.append(Violation("warn", f"[table] rows[{ri}] has {len(row)} cells, columns has {len(columns)}"))
            for ci, cell in enumerate(row):
                if isinstance(cell, (dict, list)):
                    r.violations.append(Violation("fail", f"[table] rows[{ri}][{ci}] is {type(cell).__name__} -> <Text> crash"))
                elif not _is_leaf_renderable_strict_str(cell) and cell is not None:
                    r.violations.append(Violation("warn", f"[table] rows[{ri}][{ci}] is {type(cell).__name__}, expected str"))


def _validate_comparison(data: dict, r: ValidationResult) -> None:
    options = data.get("options")
    if not isinstance(options, list) or not options:
        r.violations.append(Violation("warn", "[comparison] options missing/empty/non-list -> block renders nothing"))
        return
    if len(options) > 3:
        r.violations.append(Violation("warn", f"[comparison] {len(options)} options, mobile only renders the first 3 (options.slice(0,3))"))

    for i, opt in enumerate(options[:3]):
        if not isinstance(opt, dict):
            r.violations.append(Violation("fail", f"[comparison] options[{i}] is {type(opt).__name__}, not a dict -> `.pros`/`.cons` property access on a non-object throws"))
            continue
        name = opt.get("name")
        if name is not None and isinstance(name, (dict, list)):
            r.violations.append(Violation("fail", f"[comparison] options[{i}].name is {type(name).__name__} -> <Text> crash (o?.name ?? fallback only substitutes on null/undefined)"))
        for key in ("pros", "cons"):
            arr = opt.get(key)
            if arr is None:
                continue
            if not isinstance(arr, list):
                r.violations.append(Violation("warn", f"[comparison] options[{i}].{key} is {type(arr).__name__}, not a list -> silently treated as empty"))
                continue
            for j, item in enumerate(arr):
                if isinstance(item, (dict, list)):
                    r.violations.append(Violation("fail", f"[comparison] options[{i}].{key}[{j}] is {type(item).__name__} -> <Text>{{p}}</Text> crash"))


def _validate_timeline(data: dict, r: ValidationResult) -> None:
    steps = data.get("steps")
    if not isinstance(steps, list) or not steps:
        r.violations.append(Violation("warn", "[timeline] steps missing/empty/non-list -> block renders nothing"))
        return
    for i, st in enumerate(steps):
        if not isinstance(st, dict):
            r.violations.append(Violation("fail", f"[timeline] steps[{i}] is {type(st).__name__}, not a dict (mobile does not string-normalize timeline steps like it does flowchart/checklist)"))
            continue
        label = st.get("label")
        if label is not None and isinstance(label, (dict, list)):
            r.violations.append(Violation("fail", f"[timeline] steps[{i}].label is {type(label).__name__} -> <Text> crash"))
        elif label is None:
            r.violations.append(Violation("warn", f"[timeline] steps[{i}].label missing"))
        detail = st.get("detail")
        if detail is not None and isinstance(detail, (dict, list)):
            r.violations.append(Violation("fail", f"[timeline] steps[{i}].detail is {type(detail).__name__} -> <Text> crash (rendered when truthy)"))


def _validate_flowchart(data: dict, r: ValidationResult) -> None:
    steps = data.get("steps")
    if not isinstance(steps, list) or not steps:
        r.violations.append(Violation("warn", "[flowchart] steps missing/empty/non-list -> block renders nothing"))
        return
    for i, st in enumerate(steps):
        # Mobile normalizes a bare string step to {label: st} — that's fine.
        if isinstance(st, str):
            continue
        if not isinstance(st, dict):
            r.violations.append(Violation("fail", f"[flowchart] steps[{i}] is {type(st).__name__} (expected str or dict)"))
            continue
        label = st.get("label")
        if label is not None and isinstance(label, (dict, list)):
            r.violations.append(Violation("fail", f"[flowchart] steps[{i}].label is {type(label).__name__} -> <Text> crash"))
        note = st.get("note")
        if note is not None and isinstance(note, (dict, list)):
            r.violations.append(Violation("fail", f"[flowchart] steps[{i}].note is {type(note).__name__} -> <Text> crash (rendered when truthy)"))


def _validate_stat_cards(data: dict, r: ValidationResult) -> None:
    cards = data.get("cards")
    if not isinstance(cards, list) or not cards:
        r.violations.append(Violation("warn", "[stat_cards] cards missing/empty/non-list -> block renders nothing"))
        return
    if len(cards) > 4:
        r.violations.append(Violation("warn", f"[stat_cards] {len(cards)} cards, mobile only renders the first 4 (cards.slice(0,4))"))
    for i, c in enumerate(cards[:4]):
        if not isinstance(c, dict):
            r.violations.append(Violation("fail", f"[stat_cards] cards[{i}] is {type(c).__name__}, not a dict"))
            continue
        value = c.get("value")
        if value is not None and isinstance(value, (dict, list)):
            r.violations.append(Violation("fail", f"[stat_cards] cards[{i}].value is {type(value).__name__} -> <Text> crash (direct JSX child, not template-stringified)"))
        label = c.get("label")
        if label is not None and isinstance(label, (dict, list)):
            r.violations.append(Violation("fail", f"[stat_cards] cards[{i}].label is {type(label).__name__} -> <Text> crash"))
        # hint IS template-literal-interpolated (`${c.hint}`) so a dict there
        # merely stringifies to "[object Object]" — ugly, not a crash.
        hint = c.get("hint")
        if hint is not None and isinstance(hint, (dict, list)):
            r.violations.append(Violation("warn", f"[stat_cards] cards[{i}].hint is {type(hint).__name__} -> renders as '[object Object]' (template-literal coerced, not a crash)"))


def _validate_checklist(data: dict, r: ValidationResult) -> None:
    items = data.get("items")
    if not isinstance(items, list) or not items:
        r.violations.append(Violation("warn", "[checklist] items missing/empty/non-list -> block renders nothing"))
        return
    for i, it in enumerate(items):
        if isinstance(it, str):
            continue  # normalized to {text: it, done: False} by mobile
        if not isinstance(it, dict):
            r.violations.append(Violation("fail", f"[checklist] items[{i}] is {type(it).__name__} (expected str or dict)"))
            continue
        text = it.get("text")
        if text is not None and isinstance(text, (dict, list)):
            r.violations.append(Violation("fail", f"[checklist] items[{i}].text is {type(text).__name__} -> <Text> crash"))


def validate_method_metadata(mm: Any) -> ValidationResult:
    """method_metadata: {"methods": [{title, confidence, rationale?, sources?}]}
    mirrored from ConfidenceInfoButton.tsx: `m.title` rendered directly (FAIL if
    non-str), `Math.max(0, Math.min(100, m.confidence ?? 0))` clamps a raw
    0-100 int safely but a LEAKED 0-1 fraction (e.g. 0.85) clamps through
    unchanged and renders as "0.85% . Low" instead of "85% . High" — a real
    quality bug, flagged as its own check (0 < confidence < 1)."""
    r = ValidationResult()
    if mm is None:
        return r
    if not isinstance(mm, dict):
        r.violations.append(Violation("fail", f"method_metadata is not a dict/None: {type(mm).__name__}"))
        return r
    methods = mm.get("methods")
    if not isinstance(methods, list):
        r.violations.append(Violation("fail", f"method_metadata.methods is not a list: {type(methods).__name__}"))
        return r
    for i, m in enumerate(methods):
        if not isinstance(m, dict):
            r.violations.append(Violation("fail", f"method_metadata.methods[{i}] is not a dict"))
            continue
        title = m.get("title")
        if not isinstance(title, str) or not title.strip():
            r.violations.append(Violation("fail", f"method_metadata.methods[{i}].title missing/non-str -> <Text>{{m.title}}</Text> crash or blank"))
        conf = m.get("confidence")
        if not isinstance(conf, (int, float)) or isinstance(conf, bool):
            r.violations.append(Violation("fail", f"method_metadata.methods[{i}].confidence missing/non-numeric: {type(conf).__name__}"))
        elif 0 < conf < 1:
            r.violations.append(Violation("fail", f"method_metadata.methods[{i}].confidence={conf} looks like a leaked 0-1 fraction (0-100 scale never lands strictly between 0 and 1) -> renders as '{conf}%' instead of '{round(conf*100)}%'"))
        elif conf < 0 or conf > 100:
            r.violations.append(Violation("warn", f"method_metadata.methods[{i}].confidence={conf} outside 0-100 (mobile clamps it visually, but the raw value is out of contract)"))
        rationale = m.get("rationale")
        if rationale is not None and not isinstance(rationale, str):
            r.violations.append(Violation("warn", f"method_metadata.methods[{i}].rationale is {type(rationale).__name__}, expected str"))
        sources = m.get("sources")
        if sources is not None and not isinstance(sources, list):
            r.violations.append(Violation("warn", f"method_metadata.methods[{i}].sources is {type(sources).__name__}, expected list"))
    return r


def validate_all_blocks(blocks: list) -> ValidationResult:
    combined = ValidationResult()
    if not isinstance(blocks, list):
        combined.violations.append(Violation("fail", f"visual_blocks is not a list: {type(blocks).__name__}"))
        return combined
    if len(blocks) > 6:
        combined.violations.append(Violation("warn", f"{len(blocks)} blocks, backend contract caps at 6"))
    for i, b in enumerate(blocks):
        sub = validate_block(b)
        for v in sub.violations:
            combined.violations.append(Violation(v.severity, f"block[{i}] {v.message}"))
    return combined
