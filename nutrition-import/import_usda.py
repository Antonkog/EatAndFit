#!/usr/bin/env python3
"""Import selected USDA FoodData Central CSV tables into SQLite."""
import argparse, csv, sqlite3
from pathlib import Path

def rows(path):
    with path.open(encoding="utf-8-sig", newline="") as handle: yield from csv.DictReader(handle)

def build(source: Path, output: Path):
    temporary = output.with_suffix('.tmp.sqlite'); temporary.unlink(missing_ok=True); db = sqlite3.connect(temporary)
    db.executescript("CREATE TABLE foods(fdc_id INTEGER PRIMARY KEY,description TEXT NOT NULL,data_type TEXT); CREATE VIRTUAL TABLE food_search USING fts5(fdc_id UNINDEXED,description); CREATE TABLE nutrients(id INTEGER PRIMARY KEY,name TEXT,unit TEXT); CREATE TABLE food_nutrients(fdc_id INTEGER,nutrient_id INTEGER,amount REAL,PRIMARY KEY(fdc_id,nutrient_id)); CREATE TABLE portions(fdc_id INTEGER,amount REAL,unit TEXT,grams REAL);")
    for row in rows(source/'food.csv'):
        values=(int(row['fdc_id']),row['description'],row.get('data_type','')); db.execute('INSERT INTO foods VALUES (?,?,?)',values); db.execute('INSERT INTO food_search VALUES (?,?)',values[:2])
    for row in rows(source/'nutrient.csv'): db.execute('INSERT INTO nutrients VALUES (?,?,?)',(int(row['id']),row['name'],row.get('unit_name','')))
    valid={item[0] for item in db.execute('SELECT fdc_id FROM foods')}; nutrients={item[0] for item in db.execute('SELECT id FROM nutrients')}
    for row in rows(source/'food_nutrient.csv'):
        fdc=int(row['fdc_id']); nutrient=int(row['nutrient_id'])
        if fdc in valid and nutrient in nutrients: db.execute('INSERT OR REPLACE INTO food_nutrients VALUES (?,?,?)',(fdc,nutrient,float(row.get('amount') or 0)))
    portion_file=source/'food_portion.csv'
    if portion_file.exists():
        for row in rows(portion_file):
            fdc=int(row['fdc_id'])
            if fdc in valid and row.get('gram_weight'): db.execute('INSERT INTO portions VALUES (?,?,?,?)',(fdc,float(row.get('amount') or 1),row.get('modifier') or 'serving',float(row['gram_weight'])))
    db.commit(); db.close(); output.parent.mkdir(parents=True,exist_ok=True); temporary.replace(output)

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('source',type=Path); parser.add_argument('output',type=Path); args=parser.parse_args(); build(args.source,args.output); print(f'Built {args.output}')

