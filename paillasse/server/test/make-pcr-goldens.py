"""Références pydna pour la PCR virtuelle.

Usage (poste de développement) : pip install pydna biopython && python3 test/make-pcr-goldens.py
Écrit test/fixtures/pcr.golden.json : pour chaque couple (fichier, amorces), le produit calculé
par pydna. test/pcr.test.js vérifie que Paillasse trouve exactement le même.
"""
import glob, json, os, warnings
warnings.filterwarnings('ignore')
from Bio import SeqIO
from pydna.dseqrecord import Dseqrecord
from pydna.amplify import pcr

here = os.path.join(os.path.dirname(__file__), 'fixtures')

def primers_of(path):
    """Séquences des amorces : prises dans <fichier>.primers.json (extrait par make-goldens.py),
    car le lecteur SnapGene de Biopython n'expose pas les amorces elles-mêmes."""
    rec = SeqIO.read(path, 'snapgene')
    golden = path.replace('.dna', '.primers.json')
    if not os.path.exists(golden):
        return rec, {}
    data = json.load(open(golden))
    return rec, {p['name']: p['bases'].upper() for p in data['primers']}

cases = []
for path in sorted(glob.glob(os.path.join(here, '*.dna'))):
    rec, primers = primers_of(path)
    circular = rec.annotations['topology'] == 'circular'
    tpl = Dseqrecord(str(rec.seq).upper(), circular=circular)
    names = list(primers)
    for i, f in enumerate(names):
        for r in names:
            if f == r:
                continue
            try:
                prod = pcr(primers[f], primers[r], tpl, limit=13)
            except Exception:
                continue
            cases.append({
                'file': os.path.basename(path), 'forward': f, 'reverse': r,
                'forward_bases': primers[f], 'reverse_bases': primers[r],
                'length': len(prod), 'sequence': str(prod.seq).upper(),
            })

with open(os.path.join(here, 'pcr.golden.json'), 'w') as fh:
    json.dump(cases, fh, indent=1)
print(len(cases), 'produits de PCR calculés par pydna')
for c in cases:
    print(f"  {c['file'][:28]:29s} {c['forward'][:26]:27s} x {c['reverse'][:26]:27s} {c['length']:6d} pb")
