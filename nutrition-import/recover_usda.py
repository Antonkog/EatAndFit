#!/usr/bin/env python3
"""Emergency downloader for rebuilding the local USDA FoodData Central SQLite index."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import sqlite3
import sys
import unicodedata
import urllib.request
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator


USER_AGENT = "EatAndFit/0.1 (https://eatand.fit)"
IMPORTER_VERSION = "1"


@dataclass(frozen=True)
class Dataset:
    key: str
    release: str
    url: str
    data_type: str
    category_file: str
    category_id: str
    category_description: str


DATASETS = {
    "foundation": Dataset(
        key="foundation",
        release="2026-04-30",
        url="https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip",
        data_type="foundation_food",
        category_file="food_category.csv",
        category_id="id",
        category_description="description",
    ),
    "sr_legacy": Dataset(
        key="sr_legacy",
        release="2018-04",
        url="https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip",
        data_type="sr_legacy_food",
        category_file="food_category.csv",
        category_id="id",
        category_description="description",
    ),
    "fndds": Dataset(
        key="fndds",
        release="2024-10-31",
        url="https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip",
        data_type="survey_fndds_food",
        category_file="wweia_food_category.csv",
        category_id="wweia_food_category",
        category_description="wweia_food_category_description",
    ),
}


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE database_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
CREATE TABLE dataset_metadata (
  dataset_key TEXT PRIMARY KEY,
  release TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_sha256 TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  food_count INTEGER NOT NULL,
  nutrient_value_count INTEGER NOT NULL,
  portion_count INTEGER NOT NULL
) STRICT;
CREATE TABLE food_categories (
  dataset_key TEXT NOT NULL,
  source_id TEXT NOT NULL,
  code TEXT,
  description TEXT NOT NULL,
  PRIMARY KEY (dataset_key, source_id)
) STRICT;
CREATE TABLE measure_units (
  dataset_key TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (dataset_key, source_id)
) STRICT;
CREATE TABLE nutrients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  nutrient_number TEXT,
  rank REAL
) STRICT;
CREATE TABLE foods (
  fdc_id INTEGER PRIMARY KEY,
  dataset_key TEXT NOT NULL,
  data_type TEXT NOT NULL,
  description TEXT NOT NULL,
  normalized_description TEXT NOT NULL,
  category_source_id TEXT,
  publication_date TEXT,
  FOREIGN KEY (dataset_key, category_source_id)
    REFERENCES food_categories(dataset_key, source_id)
) STRICT;
CREATE TABLE food_nutrients (
  food_id INTEGER NOT NULL REFERENCES foods(fdc_id) ON DELETE CASCADE,
  nutrient_id INTEGER NOT NULL REFERENCES nutrients(id),
  amount REAL NOT NULL,
  data_points INTEGER,
  min_value REAL,
  max_value REAL,
  median_value REAL,
  PRIMARY KEY (food_id, nutrient_id)
) STRICT;
CREATE TABLE food_portions (
  id TEXT PRIMARY KEY,
  food_id INTEGER NOT NULL REFERENCES foods(fdc_id) ON DELETE CASCADE,
  dataset_key TEXT NOT NULL,
  sequence_number INTEGER,
  amount REAL,
  measure_unit_id INTEGER,
  portion_description TEXT,
  modifier TEXT,
  gram_weight REAL NOT NULL CHECK (gram_weight > 0),
  FOREIGN KEY (dataset_key, measure_unit_id)
    REFERENCES measure_units(dataset_key, source_id)
) STRICT;
CREATE TABLE food_aliases (
  food_id INTEGER NOT NULL REFERENCES foods(fdc_id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (food_id, normalized_alias)
) STRICT;
"""


INDEXES = """
CREATE INDEX foods_data_type_idx ON foods(data_type, description COLLATE NOCASE);
CREATE INDEX food_nutrients_food_idx ON food_nutrients(food_id, nutrient_id);
CREATE INDEX food_portions_food_idx ON food_portions(food_id, sequence_number);
CREATE INDEX food_aliases_normalized_idx ON food_aliases(normalized_alias, food_id);
CREATE VIRTUAL TABLE foods_fts USING fts5(
  fdc_id UNINDEXED,
  description,
  aliases,
  tokenize = 'unicode61 remove_diacritics 2'
);
INSERT INTO foods_fts (fdc_id, description, aliases)
SELECT f.fdc_id, f.description,
       COALESCE(group_concat(a.alias, ' '), '')
FROM foods f
LEFT JOIN food_aliases a ON a.food_id = f.fdc_id
GROUP BY f.fdc_id;
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("data/nutrition.sqlite"))
    parser.add_argument("--cache-dir", type=Path, default=Path("data/usda-cache"))
    parser.add_argument(
        "--source",
        action="append",
        default=[],
        metavar="DATASET=URL_OR_PATH",
        help="Override a pinned archive; intended for tests and offline imports.",
    )
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def normalize_text(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value).casefold()
    ascii_like = "".join(character for character in folded if not unicodedata.combining(character))
    return re.sub(r"[^\w]+", " ", ascii_like, flags=re.UNICODE).strip()


def optional_number(value: str | None, cast: type[int] | type[float]) -> int | float | None:
    if value is None or value.strip() == "":
        return None
    return cast(value)


def required_number(value: str | None, cast: type[int] | type[float], field: str):
    parsed = optional_number(value, cast)
    if parsed is None:
        raise ValueError(f"Missing required number: {field}")
    return parsed


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_overrides(values: list[str]) -> dict[str, str]:
    overrides: dict[str, str] = {}
    for value in values:
        if "=" not in value:
            raise ValueError(f"Invalid --source value: {value}")
        key, location = value.split("=", 1)
        if key not in DATASETS or not location:
            raise ValueError(f"Unknown or empty dataset override: {value}")
        overrides[key] = location
    return overrides


def download(url: str, destination: Path) -> None:
    temporary = destination.with_suffix(destination.suffix + ".part")
    temporary.unlink(missing_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        if not zipfile.is_zipfile(temporary):
            raise ValueError(f"Downloaded file is not a ZIP archive: {url}")
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def resolve_archives(cache_dir: Path, overrides: dict[str, str]) -> dict[str, tuple[Path, str]]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    resolved: dict[str, tuple[Path, str]] = {}
    for key, dataset in DATASETS.items():
        location = overrides.get(key, dataset.url)
        if location.startswith(("https://", "http://")):
            archive = cache_dir / f"{key}-{dataset.release}.zip"
            if not archive.exists() or not zipfile.is_zipfile(archive):
                archive.unlink(missing_ok=True)
                print(f"Downloading {dataset.key} {dataset.release}...", flush=True)
                download(location, archive)
        else:
            archive = Path(location).expanduser().resolve()
            if not zipfile.is_zipfile(archive):
                raise ValueError(f"Invalid ZIP archive for {key}: {archive}")
        resolved[key] = (archive, location)
    return resolved


def member_name(archive: zipfile.ZipFile, basename: str) -> str:
    matches = [name for name in archive.namelist() if Path(name).name == basename]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one {basename}; found {len(matches)}")
    return matches[0]


def rows(archive: zipfile.ZipFile, basename: str) -> Iterator[dict[str, str]]:
    name = member_name(archive, basename)
    with archive.open(name) as binary:
        with io.TextIOWrapper(binary, encoding="utf-8-sig", newline="") as text:
            yield from csv.DictReader(text)


def database_is_current(path: Path, signatures: dict[str, str]) -> bool:
    if not path.exists():
        return False
    try:
        database = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        actual = dict(database.execute("SELECT dataset_key, source_sha256 FROM dataset_metadata"))
        importer_version = database.execute(
            "SELECT value FROM database_metadata WHERE key = 'importer_version'"
        ).fetchone()
        integrity = database.execute("PRAGMA quick_check").fetchone()[0]
        database.close()
        return (
            actual == signatures
            and importer_version is not None
            and importer_version[0] == IMPORTER_VERSION
            and integrity == "ok"
        )
    except (OSError, sqlite3.Error, TypeError):
        return False


def import_reference_tables(database: sqlite3.Connection, dataset: Dataset, archive: zipfile.ZipFile) -> None:
    for row in rows(archive, dataset.category_file):
        source_id = row.get(dataset.category_id, "").strip()
        description = row.get(dataset.category_description, "").strip()
        if source_id and description:
            database.execute(
                "INSERT OR IGNORE INTO food_categories VALUES (?, ?, ?, ?)",
                (dataset.key, source_id, row.get("code") or None, description),
            )
    for row in rows(archive, "measure_unit.csv"):
        database.execute(
            "INSERT OR IGNORE INTO measure_units VALUES (?, ?, ?)",
            (dataset.key, int(row["id"]), row["name"].strip()),
        )
    for row in rows(archive, "nutrient.csv"):
        database.execute(
            "INSERT OR IGNORE INTO nutrients VALUES (?, ?, ?, ?, ?)",
            (
                int(row["id"]),
                row["name"].strip(),
                row["unit_name"].strip(),
                row.get("nutrient_nbr") or None,
                optional_number(row.get("rank"), float),
            ),
        )


def import_dataset(database: sqlite3.Connection, dataset: Dataset, archive_path: Path, source: str, signature: str) -> None:
    print(f"Importing {dataset.key} {dataset.release}...", flush=True)
    with zipfile.ZipFile(archive_path) as archive:
        import_reference_tables(database, dataset, archive)
        food_ids: set[int] = set()
        food_count = 0
        for row in rows(archive, "food.csv"):
            if row.get("data_type") != dataset.data_type:
                continue
            fdc_id = int(row["fdc_id"])
            description = row["description"].strip()
            category_id = (row.get("food_category_id") or "").strip() or None
            if category_id is not None:
                category_exists = database.execute(
                    "SELECT 1 FROM food_categories WHERE dataset_key = ? AND source_id = ?",
                    (dataset.key, category_id),
                ).fetchone()
                if not category_exists:
                    category_id = None
            database.execute(
                "INSERT INTO foods VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    fdc_id,
                    dataset.key,
                    dataset.data_type,
                    description,
                    normalize_text(description),
                    category_id,
                    row.get("publication_date") or None,
                ),
            )
            database.execute(
                "INSERT INTO food_aliases VALUES (?, ?, ?, ?)",
                (fdc_id, description, normalize_text(description), "usda_description"),
            )
            food_ids.add(fdc_id)
            food_count += 1

        nutrient_ids = {
            int(row[0])
            for row in database.execute("SELECT id FROM nutrients")
        }
        nutrient_numbers = {
            str(row[1]): int(row[0])
            for row in database.execute(
                "SELECT id, nutrient_number FROM nutrients WHERE nutrient_number IS NOT NULL"
            )
        }
        for row in rows(archive, "food_nutrient.csv"):
            food_id = int(row["fdc_id"])
            if food_id not in food_ids or not (row.get("amount") or "").strip():
                continue
            raw_nutrient_id = int(row["nutrient_id"])
            nutrient_id = (
                raw_nutrient_id
                if raw_nutrient_id in nutrient_ids
                else nutrient_numbers.get(str(raw_nutrient_id))
            )
            if nutrient_id is None:
                raise ValueError(
                    f"Unknown nutrient {raw_nutrient_id} for FDC food {food_id}"
                )
            database.execute(
                """
                INSERT OR REPLACE INTO food_nutrients
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    food_id,
                    nutrient_id,
                    float(row["amount"]),
                    optional_number(row.get("data_points"), int),
                    optional_number(row.get("min"), float),
                    optional_number(row.get("max"), float),
                    optional_number(row.get("median"), float),
                ),
            )

        for row in rows(archive, "food_portion.csv"):
            # Foundation releases include a small number of analytical portion
            # rows that are not attached to a published food record.
            if not (row.get("id") or "").strip() or not (row.get("fdc_id") or "").strip():
                continue
            food_id = int(row["fdc_id"])
            gram_weight = optional_number(row.get("gram_weight"), float)
            if food_id not in food_ids or gram_weight is None or gram_weight <= 0:
                continue
            measure_unit_id = optional_number(row.get("measure_unit_id"), int)
            if measure_unit_id is not None:
                unit_exists = database.execute(
                    "SELECT 1 FROM measure_units WHERE dataset_key = ? AND source_id = ?",
                    (dataset.key, measure_unit_id),
                ).fetchone()
                if not unit_exists:
                    measure_unit_id = None
            database.execute(
                "INSERT INTO food_portions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    f"{dataset.key}:{row['id']}",
                    food_id,
                    dataset.key,
                    optional_number(row.get("seq_num"), int),
                    optional_number(row.get("amount"), float),
                    measure_unit_id,
                    row.get("portion_description") or None,
                    row.get("modifier") or None,
                    gram_weight,
                ),
            )

        nutrient_count = database.execute(
            """
            SELECT COUNT(*)
            FROM food_nutrients fn
            JOIN foods f ON f.fdc_id = fn.food_id
            WHERE f.dataset_key = ?
            """,
            (dataset.key,),
        ).fetchone()[0]
        portion_count = database.execute(
            """
            SELECT COUNT(*)
            FROM food_portions p
            JOIN foods f ON f.fdc_id = p.food_id
            WHERE f.dataset_key = ?
            """,
            (dataset.key,),
        ).fetchone()[0]

        database.execute(
            "INSERT INTO dataset_metadata VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                dataset.key,
                dataset.release,
                source,
                signature,
                datetime.now(timezone.utc).isoformat(),
                food_count,
                nutrient_count,
                portion_count,
            ),
        )


def build_database(output: Path, archives: dict[str, tuple[Path, str]], signatures: dict[str, str]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.unlink(missing_ok=True)
    database = sqlite3.connect(temporary)
    try:
        database.execute("PRAGMA journal_mode = OFF")
        database.execute("PRAGMA synchronous = OFF")
        database.execute("PRAGMA temp_store = FILE")
        database.executescript(SCHEMA)
        database.execute("BEGIN")
        for key, dataset in DATASETS.items():
            archive, source = archives[key]
            import_dataset(database, dataset, archive, source, signatures[key])
        combined = hashlib.sha256(
            json.dumps(signatures, sort_keys=True).encode("utf-8")
        ).hexdigest()
        database.execute(
            "INSERT INTO database_metadata VALUES ('combined_signature', ?)",
            (combined,),
        )
        database.execute(
            "INSERT INTO database_metadata VALUES ('importer_version', ?)",
            (IMPORTER_VERSION,),
        )
        database.execute(
            "INSERT INTO database_metadata VALUES ('license', 'CC0 1.0 Universal')"
        )
        database.execute(
            "INSERT INTO database_metadata VALUES ('source', 'USDA FoodData Central')"
        )
        database.commit()
        print("Building indexes...", flush=True)
        database.executescript(INDEXES)
        database.execute("ANALYZE")
        database.commit()
        foreign_key_errors = database.execute("PRAGMA foreign_key_check").fetchall()
        if foreign_key_errors:
            raise ValueError(f"Foreign key validation failed: {foreign_key_errors[:5]}")
        integrity = database.execute("PRAGMA quick_check").fetchone()[0]
        if integrity != "ok":
            raise ValueError(f"SQLite integrity check failed: {integrity}")
        database.execute("PRAGMA optimize")
        database.close()
        os.replace(temporary, output)
    except Exception:
        database.close()
        temporary.unlink(missing_ok=True)
        raise


def main() -> int:
    arguments = parse_args()
    try:
        overrides = parse_overrides(arguments.source)
        archives = resolve_archives(arguments.cache_dir, overrides)
        signatures = {key: sha256(path) for key, (path, _) in archives.items()}
        if not arguments.force and database_is_current(arguments.output, signatures):
            print("USDA nutrition database is already current.", flush=True)
            return 0
        build_database(arguments.output, archives, signatures)
        size_mb = arguments.output.stat().st_size / 1024 / 1024
        print(f"Created {arguments.output} ({size_mb:.1f} MB).", flush=True)
        return 0
    except Exception as error:
        print(f"USDA import failed: {error}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
