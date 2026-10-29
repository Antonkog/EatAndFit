#!/usr/bin/env python3
"""Import the DataHive recipes-with-nutrition CSV into a compact SQLite index."""
import argparse
import csv
import hashlib
import sqlite3
from pathlib import Path

def number(value):
    try: return float(value or "")
    except ValueError: return None

def import_recipes(source: Path, output: Path) -> int:
    temporary = output.with_suffix(".tmp.sqlite"); temporary.unlink(missing_ok=True)
    db = sqlite3.connect(temporary)
    db.executescript("CREATE TABLE recipes(id TEXT PRIMARY KEY,title TEXT NOT NULL,source TEXT,url TEXT,image_url TEXT,servings REAL,calories REAL,cuisine TEXT,dish TEXT,meal TEXT,diet TEXT,health TEXT,cautions TEXT,ingredient_lines TEXT,nutrients TEXT); CREATE VIRTUAL TABLE recipe_search USING fts5(id UNINDEXED,title,ingredients);")
    count = 0
    with source.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            title = row.get("recipe_name", "").strip(); url = row.get("url", "").strip()
            if not title: continue
            recipe_id = hashlib.sha256(f"{title}\0{url}".encode()).hexdigest()[:20]
            ingredients = row.get("ingredient_lines", "[]")
            values = (recipe_id,title,row.get("source",""),url,row.get("image_url",""),number(row.get("servings")),number(row.get("calories")),row.get("cuisine_type",""),row.get("dish_type",""),row.get("meal_type",""),row.get("diet_labels",""),row.get("health_labels",""),row.get("cautions",""),ingredients,row.get("total_nutrients","{}"))
            db.execute("INSERT OR REPLACE INTO recipes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", values)
            db.execute("INSERT INTO recipe_search VALUES (?,?,?)", (recipe_id,title,ingredients)); count += 1
    db.commit(); db.close(); output.parent.mkdir(parents=True, exist_ok=True); temporary.replace(output)
    return count

if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("input", type=Path); parser.add_argument("output", type=Path); parser.add_argument("--expected-rows", type=int, default=39447)
    args = parser.parse_args(); total = import_recipes(args.input, args.output)
    if total != args.expected_rows: raise SystemExit(f"Expected {args.expected_rows} recipes, imported {total}")
    print(f"Imported {total} recipes")

