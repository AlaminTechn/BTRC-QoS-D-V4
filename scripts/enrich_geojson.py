#!/usr/bin/env python3
"""
enrich_geojson.py — Add name_en and name_bn properties to GeoJSON features.

Reads from DB and enriches:
  geodata/bangladesh_divisions_8.geojson  → adds name_en, name_bn per division
  geodata/bgd_districts.geojson           → adds name_en, name_bn per district

Run once:
  python3 scripts/enrich_geojson.py
"""
import json, pathlib

ROOT = pathlib.Path(__file__).parent.parent

# ── Division data (GeoJSON NAME_1 → name_en, name_bn) ────────────────────────
# name_en = canonical English (same as NAME_1); name_bn = Bengali from DB
DIVISIONS = {
    'Barisal':    ('Barisal',    'বরিশাল'),
    'Chattagram': ('Chattagram', 'চট্টগ্রাম'),
    'Dhaka':      ('Dhaka',      'ঢাকা'),
    'Khulna':     ('Khulna',     'খুলনা'),
    'Mymensingh': ('Mymensingh', 'ময়মনসিংহ'),
    'Rajshahi':   ('Rajshahi',   'রাজশাহী'),
    'Rangpur':    ('Rangpur',    'রংপুর'),
    'Sylhet':     ('Sylhet',     'সিলেট'),
}

# ── District data (GeoJSON shapeName → name_en, name_bn) ─────────────────────
# name_en = clean English display name (= shapeName)
# name_bn = Bengali from DB (mapped via GeoJSON→DB name via DIST_GEO_TO_DB)
DIST_GEO_TO_DB = {
    'Bogra':          'Bogura',
    'Brahamanbaria':  'Brahmanbaria',
    'Nawabganj':      'Chapainawabganj',
    'Chittagong':     'Chattogram',
    "Cox's Bazar":    'Coxsbazar',
    'Jessore':        'Jashore',
    'Jhalokati':      'Jhalakathi',
    'Maulvibazar':    'Moulvibazar',
    'Netrakona':      'Netrokona',
}

DB_NAME_BN = {
    'Bagerhat':       'বাগেরহাট',
    'Bandarban':      'বান্দরবান',
    'Barguna':        'বরগুনা',
    'Barisal':        'বরিশাল',
    'Bhola':          'ভোলা',
    'Bogura':         'বগুড়া',
    'Brahmanbaria':   'ব্রাহ্মণবাড়িয়া',
    'Chandpur':       'চাঁদপুর',
    'Chapainawabganj':'চাঁপাইনবাবগঞ্জ',
    'Chattogram':     'চট্টগ্রাম',
    'Chuadanga':      'চুয়াডাঙ্গা',
    'Comilla':        'কুমিল্লা',
    'Coxsbazar':      'কক্সবাজার',
    'Dhaka':          'ঢাকা',
    'Dinajpur':       'দিনাজপুর',
    'Faridpur':       'ফরিদপুর',
    'Feni':           'ফেনী',
    'Gaibandha':      'গাইবান্ধা',
    'Gazipur':        'গাজীপুর',
    'Gopalganj':      'গোপালগঞ্জ',
    'Habiganj':       'হবিগঞ্জ',
    'Jamalpur':       'জামালপুর',
    'Jashore':        'যশোর',
    'Jhalakathi':     'ঝালকাঠি',
    'Jhenaidah':      'ঝিনাইদহ',
    'Joypurhat':      'জয়পুরহাট',
    'Khagrachhari':   'খাগড়াছড়ি',
    'Khulna':         'খুলনা',
    'Kishoreganj':    'কিশোরগঞ্জ',
    'Kurigram':       'কুড়িগ্রাম',
    'Kushtia':        'কুষ্টিয়া',
    'Lakshmipur':     'লক্ষ্মীপুর',
    'Lalmonirhat':    'লালমনিরহাট',
    'Madaripur':      'মাদারীপুর',
    'Magura':         'মাগুরা',
    'Manikganj':      'মানিকগঞ্জ',
    'Meherpur':       'মেহেরপুর',
    'Moulvibazar':    'মৌলভীবাজার',
    'Munshiganj':     'মুন্সিগঞ্জ',
    'Mymensingh':     'ময়মনসিংহ',
    'Naogaon':        'নওগাঁ',
    'Narail':         'নড়াইল',
    'Narayanganj':    'নারায়ণগঞ্জ',
    'Narsingdi':      'নরসিংদী',
    'Natore':         'নাটোর',
    'Netrokona':      'নেত্রকোণা',
    'Nilphamari':     'নীলফামারী',
    'Noakhali':       'নোয়াখালী',
    'Pabna':          'পাবনা',
    'Panchagarh':     'পঞ্চগড়',
    'Patuakhali':     'পটুয়াখালী',
    'Pirojpur':       'পিরোজপুর',
    'Rajbari':        'রাজবাড়ী',
    'Rajshahi':       'রাজশাহী',
    'Rangamati':      'রাঙ্গামাটি',
    'Rangpur':        'রংপুর',
    'Satkhira':       'সাতক্ষীরা',
    'Shariatpur':     'শরীয়তপুর',
    'Sherpur':        'শেরপুর',
    'Sirajganj':      'সিরাজগঞ্জ',
    'Sunamganj':      'সুনামগঞ্জ',
    'Sylhet':         'সিলেট',
    'Tangail':        'টাঙ্গাইল',
    'Thakurgaon':     'ঠাকুরগাঁও',
}


def enrich_divisions():
    path = ROOT / 'geodata' / 'bangladesh_divisions_8.geojson'
    with open(path, encoding='utf-8') as f:
        gj = json.load(f)

    missing = []
    for feature in gj['features']:
        key = feature['properties'].get('NAME_1', '')
        if key in DIVISIONS:
            en, bn = DIVISIONS[key]
            feature['properties']['name_en'] = en
            feature['properties']['name_bn'] = bn
        else:
            missing.append(key)

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(gj, f, ensure_ascii=False, indent=2)

    print(f'Divisions enriched: {len(gj["features"])} features')
    if missing:
        print(f'  WARNING — unmapped: {missing}')


def enrich_districts():
    path = ROOT / 'geodata' / 'bgd_districts.geojson'
    with open(path, encoding='utf-8') as f:
        gj = json.load(f)

    missing = []
    for feature in gj['features']:
        shape_name = feature['properties'].get('shapeName', '')
        db_name    = DIST_GEO_TO_DB.get(shape_name, shape_name)
        name_bn    = DB_NAME_BN.get(db_name)

        if name_bn:
            feature['properties']['name_en'] = shape_name   # English = shapeName
            feature['properties']['name_bn'] = name_bn
        else:
            missing.append(shape_name)

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(gj, f, ensure_ascii=False, indent=2)

    print(f'Districts enriched: {len(gj["features"])} features')
    if missing:
        print(f'  WARNING — unmapped: {missing}')


if __name__ == '__main__':
    enrich_divisions()
    enrich_districts()
    print('Done — GeoJSON files updated with name_en and name_bn.')
