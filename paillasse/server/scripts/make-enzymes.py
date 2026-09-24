"""Génère src/lib/seq/enzymes.json à partir de REBASE (via Biopython).

Usage (poste de développement) : pip install biopython && python3 scripts/make-enzymes.py
Garde les enzymes commerciales qui coupent une fois, à une position connue.
Conventions (celles de Biopython/REBASE) :
  fst5 : coupure du brin supérieur, comptée depuis le début du site
  fst3 : coupure du brin inférieur, comptée depuis la fin du site
  ovhg : < 0 extrémité 5' sortante, > 0 extrémité 3' sortante, 0 franche
"""
import json, os
import Bio
from Bio.Restriction import CommOnly
from Bio.Restriction.Restriction_Dictionary import suppliers

# Enzymes dépendantes d'une modification de l'ADN (AbaSI, MspJI, FspEI, LpnPI…) :
# sites très courts, inutiles en clonage ; on les exclut (moins de 4 bases définies dans le site)
excluded = []
enzymes = []
for e in sorted(CommOnly, key=lambda x: str(x)):
    if sum(c in 'ACGT' for c in str(e.site)) < 4:
        excluded.append(str(e))
        continue
    # (les enzymes « ambiguës » comme BsaI ou SfiI ont un site avec des N mais une coupure connue : on les garde)
    if e.cut_twice() or e.fst5 is None or e.fst3 is None or not e.is_defined() and not e.is_ambiguous():
        continue
    enzymes.append({
        'name': str(e), 'site': str(e.site), 'size': e.size, 'fst5': e.fst5, 'fst3': e.fst3,
        'ovhg': e.ovhg, 'ovhgseq': e.ovhgseq, 'suppliers': ''.join(sorted(e.suppl)),
        'palindromic': e.is_palindromic(),
    })
out = {
    'source': f'REBASE via Biopython {Bio.__version__}',
    'suppliers': {k: v[0] for k, v in suppliers.items()},
    'enzymes': enzymes,
}
path = os.path.join(os.path.dirname(__file__), '..', 'src', 'lib', 'seq', 'enzymes.json')
with open(path, 'w') as fh:
    json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
print(len(enzymes), 'enzymes écrites dans', os.path.normpath(path))
print('exclues (site trop court) :', ', '.join(excluded))
