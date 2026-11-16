"""Régénère les références Biopython des fichiers de test SnapGene.

Usage (poste de développement, pas nécessaire en production) :
    pip install biopython
    python3 test/make-goldens.py

Pour chaque fixtures/X.dna, écrit fixtures/X.biopython.json : ce que Biopython
lit dans le fichier. test/sequences.test.js vérifie que le lecteur de Paillasse
trouve exactement la même chose.
"""
import glob, json, os, re
from Bio import SeqIO

def clean(v):
    return re.sub(r'\s+', ' ', v.replace('&nbsp;', ' ')).strip() if isinstance(v, str) else v

here = os.path.join(os.path.dirname(__file__), 'fixtures')
for path in sorted(glob.glob(os.path.join(here, '*.dna'))):
    rec = SeqIO.read(path, 'snapgene')
    feats = []
    for f in rec.features:
        parts = sorted([int(p.start), int(p.end)] for p in f.location.parts)
        feats.append({
            'type': f.type,
            'label': clean((f.qualifiers.get('label') or [''])[0]),
            'strand': f.location.strand,
            'parts': parts,
            'qualifiers': {k: [clean(x) for x in v] for k, v in f.qualifiers.items() if k not in ('label', 'name', 'parts')},
        })
    out = {'length': len(rec.seq), 'sequence': str(rec.seq), 'topology': rec.annotations['topology'], 'features': feats}
    with open(path.replace('.dna', '.biopython.json'), 'w') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(os.path.basename(path), len(feats), 'annotations')

# --- Sites de coupure (digestion virtuelle) : toutes les enzymes de enzymes.json ---
from Bio.Restriction import RestrictionBatch
from Bio.Seq import Seq
enz = json.load(open(os.path.join(here, '..', '..', 'src', 'lib', 'seq', 'enzymes.json')))['enzymes']
batch = RestrictionBatch([e['name'] for e in enz])
for path in sorted(glob.glob(os.path.join(here, '*.dna'))):
    rec = SeqIO.read(path, 'snapgene')
    linear = rec.annotations['topology'] != 'circular'
    res = batch.search(Seq(str(rec.seq).upper()), linear=linear)
    cuts = {str(k): sorted(v) for k, v in res.items() if v}
    with open(path.replace('.dna', '.cuts.json'), 'w') as fh:
        json.dump(cuts, fh, sort_keys=True)
    print(os.path.basename(path), len(cuts), 'enzymes coupent')

# --- Sites d'hybridation trouvés par SnapGene (référence du moteur d'hybridation) ---
from struct import unpack
from xml.etree import ElementTree as ET

def snapgene_primer_sites(path):
    data = open(path, 'rb').read()
    i, xml = 0, None
    while i < len(data):
        t = data[i]
        L = unpack('>I', data[i + 1:i + 5])[0]
        body = data[i + 5:i + 5 + L]
        i += 5 + L
        if t == 5:
            xml = body.decode('utf8')
    if not xml:
        return {'params': None, 'primers': []}
    root = ET.fromstring(xml)
    hp = root.find('HybridizationParams')
    out = []
    for p in root.findall('Primer'):
        sites = []
        for bs in p.findall('BindingSite'):
            if bs.get('simplified') == '1':
                continue
            comps = [c for c in bs.findall('Component') if c.get('hybridizedRange')]
            if not comps:
                continue
            # dernier composant hybridé dans l'ordre de l'amorce = celui qui porte l'extrémité 3'
            a, b = [int(x) for x in comps[-1].get('hybridizedRange').split('-')]
            bound = bs.get('boundStrand') == '1'
            sites.append({
                'strand': -1 if bound else 1,
                'three_prime_end': a if bound else b,
                'annealed': bs.get('annealedBases'),
                'tm': int(bs.get('meltingTemperature')),
                'components': [
                    {'bases': c.get('bases'), 'range': c.get('hybridizedRange')} for c in bs.findall('Component')
                ],
            })
        if sites:
            out.append({'name': p.get('name'), 'bases': p.get('sequence'), 'sites': sites})
    return {'params': dict(hp.attrib) if hp is not None else None, 'primers': out}

for path in sorted(glob.glob(os.path.join(here, '*.dna'))):
    data = snapgene_primer_sites(path)
    with open(path.replace('.dna', '.primers.json'), 'w') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    print(os.path.basename(path), len(data['primers']), 'amorces avec sites')
