#!/usr/bin/env python3
"""Import the DataHive recipes-with-nutrition CSV into SQLite."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Iterable


EXPECTED_COLUMNS = [
    "recipe_name", "source", "url", "servings", "calories", "total_weight_g",
    "image_url", "diet_labels", "health_labels", "cautions", "cuisine_type",
    "meal_type", "dish_type", "ingredient_lines", "ingredients",
    "total_nutrients", "daily_values", "digest",
]

LABEL_FIELDS = {
    "cuisine_type": "cuisine",
    "meal_type": "meal",
    "dish_type": "dish",
    "diet_labels": "diet",
    "health_labels": "health",
    "cautions": "caution",
}

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  servings REAL NOT NULL CHECK (servings > 0),
  calories_per_serving REAL NOT NULL,
  protein_per_serving REAL NOT NULL,
  carbohydrate_per_serving REAL NOT NULL,
  fat_per_serving REAL NOT NULL,
  total_weight_g REAL NOT NULL,
  image_url TEXT
) STRICT;
CREATE TABLE recipe_ingredients (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  line TEXT NOT NULL,
  food TEXT,
  weight_g REAL,
  measure TEXT,
  quantity REAL,
  PRIMARY KEY (recipe_id, position)
) STRICT;
CREATE TABLE recipe_labels (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (recipe_id, kind, value)
) STRICT;
CREATE TABLE recipe_nutrients (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  quantity_per_serving REAL NOT NULL,
  unit TEXT NOT NULL,
  daily_percent_per_serving REAL,
  PRIMARY KEY (recipe_id, code)
) STRICT;
CREATE VIRTUAL TABLE recipes_fts USING fts5(
  id UNINDEXED, title, ingredients, tokenize = 'unicode61 remove_diacritics 2'
);
CREATE INDEX recipes_title_idx ON recipes(title COLLATE NOCASE, id);
CREATE INDEX recipes_calories_idx ON recipes(calories_per_serving);
CREATE INDEX recipe_labels_filter_idx ON recipe_labels(kind, value, recipe_id);
CREATE INDEX recipe_ingredients_recipe_idx ON recipe_ingredients(recipe_id, position);
CREATE INDEX recipe_nutrients_recipe_idx ON recipe_nutrients(recipe_id, code);
"""


def parse_json(row: dict[str, str], field: str, expected: type) -> Any:
    try:
        value = json.loads(row[field])
    except (KeyError, json.JSONDecodeError) as error:
        raise ValueError(f"Invalid JSON in {field}") from error
    if not isinstance(value, expected):
        raise ValueError(f"Unexpected JSON shape in {field}")
    return value


def finite_number(value: Any, field: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"Invalid number in {field}") from error
    if number != number or number in (float("inf"), float("-inf")):
        raise ValueError(f"Invalid number in {field}")
    return number


def source_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def flatten_digest(items: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    flattened: dict[str, dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        if isinstance(item.get("tag"), str) and item["tag"]:
            flattened[item["tag"]] = item
        if isinstance(item.get("sub"), list):
            flattened.update(flatten_digest(item["sub"]))
    return flattened


def database_is_current(path: Path, signature: str, expected_rows: int) -> bool:
    if not path.exists():
        return False
    try:
        database = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        metadata = dict(database.execute("SELECT key, value FROM metadata"))
        count = database.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
        integrity = database.execute("PRAGMA quick_check").fetchone()[0]
        database.close()
        return (
            metadata.get("source_sha256") == signature
            and int(metadata.get("row_count", "0")) == expected_rows
            and count == expected_rows
            and integrity == "ok"
        )
    except (OSError, sqlite3.Error, ValueError):
        return False


def import_recipes(source: Path, output: Path, expected_rows: int) -> int:
    signature = source_sha256(source)
    if database_is_current(output, signature, expected_rows):
        return expected_rows

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.unlink(missing_ok=True)
    database = sqlite3.connect(temporary)
    database.execute("PRAGMA journal_mode = OFF")
    database.execute("PRAGMA synchronous = OFF")
    database.execute("PRAGMA temp_store = MEMORY")
    database.executescript(SCHEMA)
    row_count = 0

    try:
        with source.open("r", encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            if reader.fieldnames != EXPECTED_COLUMNS:
                raise ValueError("Unexpected CSV columns")
            database.execute("BEGIN")
            for row_count, row in enumerate(reader, start=1):
                title = row["recipe_name"].strip()
                source_name = row["source"].strip()
                source_url = row["url"].strip()
                if not title or not source_name or not source_url:
                    raise ValueError(f"Missing required field at row {row_count}")

                servings = finite_number(row["servings"], "servings")
                calories = finite_number(row["calories"], "calories")
                total_weight = finite_number(row["total_weight_g"], "total_weight_g")
                if servings <= 0 or calories < 0 or total_weight < 0:
                    raise ValueError(f"Invalid recipe totals at row {row_count}")

                ingredient_lines = parse_json(row, "ingredient_lines", list)
                ingredients = parse_json(row, "ingredients", list)
                nutrients = parse_json(row, "total_nutrients", dict)
                daily_values = parse_json(row, "daily_values", dict)
                digest = flatten_digest(parse_json(row, "digest", list))
                labels = {field: parse_json(row, field, list) for field in LABEL_FIELDS}

                def nutrient_total(code: str) -> float:
                    value = nutrients.get(code)
                    fallback = digest.get(code)
                    if isinstance(value, dict) and value.get("quantity") is not None:
                        return max(0.0, finite_number(value["quantity"], f"nutrient {code}"))
                    if isinstance(fallback, dict) and fallback.get("total") is not None:
                        return max(0.0, finite_number(fallback["total"], f"digest {code}"))
                    return 0.0

                recipe_id = "dh_" + hashlib.sha256(source_url.encode()).hexdigest()[:20]
                database.execute(
                    "INSERT INTO recipes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        recipe_id, title, source_name, source_url, servings,
                        calories / servings, nutrient_total("PROCNT") / servings,
                        nutrient_total("CHOCDF") / servings, nutrient_total("FAT") / servings,
                        total_weight, row["image_url"].strip() or None,
                    ),
                )

                search_lines: list[str] = []
                for position, raw_line in enumerate(ingredient_lines, start=1):
                    line = str(raw_line).strip()
                    structured = ingredients[position - 1] if position <= len(ingredients) and isinstance(ingredients[position - 1], dict) else {}
                    food = str(structured.get("food") or "").strip() or None
                    search_lines.extend(value for value in (line, food) if value)
                    database.execute(
                        "INSERT INTO recipe_ingredients VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (
                            recipe_id, position, line, food,
                            finite_number(structured["weight"], "ingredient weight") if structured.get("weight") is not None else None,
                            str(structured.get("measure") or "").strip() or None,
                            finite_number(structured["quantity"], "ingredient quantity") if structured.get("quantity") is not None else None,
                        ),
                    )

                for field, kind in LABEL_FIELDS.items():
                    for raw_value in labels[field]:
                        value = str(raw_value).strip()
                        if value:
                            database.execute("INSERT OR IGNORE INTO recipe_labels VALUES (?, ?, ?)", (recipe_id, kind, value))

                for code in sorted(set(nutrients) | set(digest)):
                    value = nutrients.get(code)
                    fallback = digest.get(code, {})
                    if isinstance(value, dict):
                        quantity = value.get("quantity")
                        label = value.get("label") or fallback.get("label") or code
                        unit = value.get("unit") or fallback.get("unit") or ""
                    else:
                        quantity = fallback.get("total")
                        label = fallback.get("label") or code
                        unit = fallback.get("unit") or ""
                    if quantity is None:
                        continue
                    daily = daily_values.get(code)
                    daily_quantity = daily.get("quantity") if isinstance(daily, dict) else fallback.get("daily")
                    database.execute(
                        "INSERT OR REPLACE INTO recipe_nutrients VALUES (?, ?, ?, ?, ?, ?)",
                        (
                            recipe_id, code, str(label), max(0.0, finite_number(quantity, f"nutrient {code}")) / servings,
                            str(unit), max(0.0, finite_number(daily_quantity, f"daily value {code}")) / servings if daily_quantity is not None else None,
                        ),
                    )

                database.execute("INSERT INTO recipes_fts VALUES (?, ?, ?)", (recipe_id, title, " ".join(search_lines)))

        if row_count != expected_rows:
            raise ValueError(f"Expected {expected_rows} rows, imported {row_count}")
        database.executemany(
            "INSERT INTO metadata VALUES (?, ?)",
            [("source_sha256", signature), ("row_count", str(row_count)), ("license", "CC BY-NC 4.0"), ("provider", "datahive")],
        )
        database.commit()
        integrity = database.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise ValueError(f"SQLite integrity check failed: {integrity}")
        database.execute("PRAGMA optimize")
        database.close()
        os.replace(temporary, output)
        return row_count
    except Exception:
        database.close()
        temporary.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--expected-rows", type=int, default=39447)
    arguments = parser.parse_args()
    imported = import_recipes(arguments.input, arguments.output, arguments.expected_rows)
    print(f"Imported {imported} recipes")
