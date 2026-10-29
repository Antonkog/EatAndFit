#!/usr/bin/env python3
"""Build the browser exercise catalog from the local SQLite library."""

import argparse
import json
import sqlite3
from pathlib import Path


def grouped(connection: sqlite3.Connection, table: str) -> dict[str, list[str]]:
    rows = connection.execute(
        f"SELECT exercise_id, value FROM {table} ORDER BY exercise_id, position"
    )
    result: dict[str, list[str]] = {}
    for exercise_id, value in rows:
        result.setdefault(exercise_id, []).append(value)
    return result


def build(source: Path) -> dict:
    connection = sqlite3.connect(source)
    connection.row_factory = sqlite3.Row
    steps = grouped(connection, "exercise_steps")
    cues = grouped(connection, "exercise_form_cues")
    mistakes = grouped(connection, "exercise_common_mistakes")
    aliases = grouped(connection, "exercise_aliases")
    media: dict[str, dict[str, dict[str, str]]] = {}
    for row in connection.execute(
        "SELECT exercise_id, kind, gender, source_url FROM media_assets"
    ):
        media.setdefault(row[0], {}).setdefault(row[1], {})[row[2]] = row[3]

    exercises = []
    for row in connection.execute("SELECT * FROM exercises ORDER BY name"):
        item = dict(row)
        item.update(
            steps=steps.get(row["id"], []),
            formCues=cues.get(row["id"], []),
            commonMistakes=mistakes.get(row["id"], []),
            aliases=aliases.get(row["id"], []),
            media=media.get(row["id"], {}),
        )
        exercises.append(item)
    groups = [dict(row) for row in connection.execute(
        "SELECT id, title_en AS title FROM muscle_groups ORDER BY id"
    )]
    connection.close()
    return {"version": 1, "groups": groups, "exercises": exercises}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/data/catalog.json"))
    args = parser.parse_args()
    catalog = build(args.source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalog, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(catalog['exercises'])} exercises to {args.output}")


if __name__ == "__main__":
    main()

