// Dessin et analyse d'amorces avec primer3 (primer3_core, le programme de référence).
// Installation sur le serveur : sudo apt install primer3
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { HttpError } from '../errors.js';
import { revcomp } from './enzymes.js';

const BIN = process.env.PRIMER3_CORE || 'primer3_core';
const CONFIG = process.env.PRIMER3_CONFIG || ['/etc/primer3_config/', '/usr/share/primer3/primer3_config/', '/opt/homebrew/share/primer3/primer3_config/'].find((p) => fs.existsSync(p));
export const MAX_OLIGO = 36; // limite de primer3

// Conditions de calcul du Tm (réglages par défaut de primer3), affichées avec les résultats
export const CONDITIONS = { monovalent_mM: 50, divalent_mM: 1.5, dntp_mM: 0.6, oligo_nM: 50 };
// Seuils de primer3 au-delà desquels structures secondaires et dimères posent problème (°C)
export const LIMITS = { hairpin: 47, selfDimer: 47, pairDimer: 47 };

const common = () => ({
  PRIMER_THERMODYNAMIC_PARAMETERS_PATH: CONFIG,
  PRIMER_SALT_MONOVALENT: CONDITIONS.monovalent_mM,
  PRIMER_SALT_DIVALENT: CONDITIONS.divalent_mM,
  PRIMER_DNTP_CONC: CONDITIONS.dntp_mM,
  PRIMER_DNA_CONC: CONDITIONS.oligo_nM,
});

export function primer3Available() {
  return new Promise((resolve) => {
    const p = spawn(BIN, ['--about']);
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

/** Lance primer3 sur une série d'enregistrements Boulder-IO ; renvoie les enregistrements lus. */
export function runPrimer3(records, { timeoutMs = 30000 } = {}) {
  const input = records.map((r) => Object.entries({ ...common(), ...r })
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${String(v).replace(/[\r\n=]/g, ' ')}`).join('\n') + '\n=\n').join('');
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const p = spawn(BIN, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.on('error', () => {
      clearTimeout(timer);
      reject(new HttpError(503, "primer3 n'est pas installé sur le serveur (sudo apt install primer3)."));
    });
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out) return reject(new HttpError(500, `primer3 a échoué : ${err.trim() || `code ${code}`}`));
      const parsed = out.split(/^=$/m).filter((b) => b.trim()).map((block) => Object.fromEntries(
        block.trim().split('\n').map((line) => {
          const i = line.indexOf('=');
          return [line.slice(0, i), line.slice(i + 1)];
        }),
      ));
      resolve(parsed);
    });
    p.stdin.end(input);
  });
}

const num = (v) => (v === undefined ? null : Math.round(Number(v) * 10) / 10);

function oligoInfo(rec, side = 'LEFT') {
  const k = (s) => rec[`PRIMER_${side}_0_${s}`];
  const info = {
    tm: num(k('TM')),
    gc: num(k('GC_PERCENT')),
    hairpin: num(k('HAIRPIN_TH')),
    selfDimer: num(k('SELF_ANY_TH')),
    selfEnd: num(k('SELF_END_TH')),
    endStability: num(k('END_STABILITY')),
    problems: (k('PROBLEMS') ?? '').split(';').map((s) => s.trim()).filter((s) => s && !/Temperature too (low|high)/.test(s)),
  };
  info.warnings = warnings(info);
  return info;
}

function warnings(i) {
  const w = [];
  if (i.hairpin >= LIMITS.hairpin) w.push(`épingle stable (Tm ${i.hairpin} °C)`);
  if (i.selfDimer >= LIMITS.selfDimer || i.selfEnd >= LIMITS.selfDimer) w.push(`auto-dimère (Tm ${Math.max(i.selfDimer, i.selfEnd)} °C)`);
  return w;
}

/** Tm, GC, épingles et dimères d'un ou plusieurs oligos (partie hybridée, 36 nt au plus). */
export async function analyzeOligos(oligos) {
  const clean = oligos.map((o) => String(o).replace(/\s+/g, '').toUpperCase());
  for (const o of clean) {
    if (!/^[ACGT]+$/.test(o)) throw new HttpError(400, `Amorce invalide : ${o.slice(0, 40)} (A, C, G, T uniquement).`);
  }
  const recs = await runPrimer3(clean.map((o) => ({
    PRIMER_TASK: 'check_primers', PRIMER_PICK_ANYWAY: 1, SEQUENCE_PRIMER: o.slice(-MAX_OLIGO), PRIMER_MIN_SIZE: 5,
  })));
  return clean.map((o, i) => ({
    sequence: o,
    analyzed: o.slice(-MAX_OLIGO),
    truncated: o.length > MAX_OLIGO,
    length: o.length,
    ...oligoInfo(recs[i] ?? {}),
    error: recs[i]?.PRIMER_ERROR ?? null,
  }));
}

export async function pairDimer(a, b) {
  const [r] = await runPrimer3([{
    PRIMER_TASK: 'check_primers', PRIMER_PICK_ANYWAY: 1, PRIMER_MIN_SIZE: 5,
    SEQUENCE_PRIMER: a.slice(-MAX_OLIGO), SEQUENCE_PRIMER_REVCOMP: b.slice(-MAX_OLIGO),
  }]);
  return { any: num(r?.PRIMER_PAIR_0_COMPL_ANY_TH), end: num(r?.PRIMER_PAIR_0_COMPL_END_TH) };
}

const circularSlice = (seq, start, length) => {
  const n = seq.length;
  let s = '';
  for (let i = 0; i < length; i += 1) s += seq[(start + i) % n];
  return s;
};

/**
 * Amorces qui amplifient EXACTEMENT la région [start, end] (bornes incluses) : clonage d'un gène,
 * d'un domaine… La longueur de chaque amorce est choisie pour approcher le Tm visé.
 */
export async function designExact(sequence, circular, start, end, { targetTm = 60, minLen = 16, maxLen = 32 } = {}) {
  const seq = sequence.toUpperCase();
  const n = seq.length;
  const length = start <= end ? end - start + 1 : n - start + end + 1;
  if (length < minLen * 2) throw new HttpError(400, `Région trop courte (${length} pb) pour y placer deux amorces.`);
  const forwards = [];
  const reverses = [];
  for (let L = minLen; L <= maxLen; L += 1) {
    forwards.push(circularSlice(seq, start, L));
    reverses.push(revcomp(circularSlice(seq, (end - L + 1 + n) % n, L)));
  }
  const infos = await analyzeOligos([...forwards, ...reverses]);
  const score = (o) => Math.abs(o.tm - targetTm) + o.warnings.length * 4 + (/[GC]$/.test(o.sequence) ? 0 : 1.5);
  const rank = (list) => list.map((o) => ({ ...o, score: Math.round(score(o) * 10) / 10 })).sort((a, b) => a.score - b.score).slice(0, 4);
  const fwd = rank(infos.slice(0, forwards.length)).map((o) => ({ ...o, strand: 1, start, end: (start + o.length - 1) % n }));
  const rev = rank(infos.slice(forwards.length)).map((o) => ({ ...o, strand: -1, start: (end - o.length + 1 + n) % n, end }));
  const dimer = await pairDimer(fwd[0].sequence, rev[0].sequence);
  return { mode: 'exact', product: length, forward: fwd, reverse: rev, pairDimer: dimer, conditions: CONDITIONS, limits: LIMITS };
}

/**
 * primer3 choisit librement une paire qui encadre la région (vérification par PCR, séquençage…).
 */
export async function designFlanking(sequence, circular, start, end, { productMin, productMax, targetTm = 60, count = 5 } = {}) {
  const seq = sequence.toUpperCase();
  const n = seq.length;
  const length = start <= end ? end - start + 1 : n - start + end + 1;
  const pMin = productMin ?? length + 60;
  const pMax = productMax ?? length + 600;
  const flank = Math.min(pMax, 3000);
  // Fenêtre autour de la cible ; séquence circulaire : on la « déroule » à partir de la fenêtre
  let offset;
  let template;
  if (circular) {
    const size = Math.min(n, length + 2 * flank);
    offset = (start - Math.floor((size - length) / 2) + n) % n;
    template = circularSlice(seq, offset, size);
  } else {
    offset = Math.max(0, start - flank);
    template = seq.slice(offset, Math.min(n, end + 1 + flank));
  }
  const targetStart = (start - offset + n) % n;
  const [r] = await runPrimer3([{
    SEQUENCE_ID: 'cible',
    SEQUENCE_TEMPLATE: template,
    SEQUENCE_TARGET: `${targetStart},${length}`,
    PRIMER_TASK: 'generic',
    PRIMER_PICK_LEFT_PRIMER: 1,
    PRIMER_PICK_RIGHT_PRIMER: 1,
    PRIMER_OPT_TM: targetTm,
    PRIMER_MIN_TM: targetTm - 5,
    PRIMER_MAX_TM: targetTm + 5,
    PRIMER_PRODUCT_SIZE_RANGE: `${pMin}-${pMax}`,
    PRIMER_NUM_RETURN: count,
    PRIMER_EXPLAIN_FLAG: 1,
  }]);
  if (r.PRIMER_ERROR) throw new HttpError(400, `primer3 : ${r.PRIMER_ERROR}`);
  const pairs = [];
  for (let i = 0; i < Number(r.PRIMER_PAIR_NUM_RETURNED ?? 0); i += 1) {
    const side = (s) => {
      const [pos, len] = r[`PRIMER_${s}_${i}`].split(',').map(Number);
      // primer3 : gauche = début, droite = position de l'extrémité 3′ (dernière base à gauche)
      const a = s === 'LEFT' ? pos : pos - len + 1;
      const rec = Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith(`PRIMER_${s}_${i}_`)).map(([k, v]) => [k.replace(`_${i}_`, '_0_'), v]));
      return {
        sequence: r[`PRIMER_${s}_${i}_SEQUENCE`], length: len, strand: s === 'LEFT' ? 1 : -1,
        start: (a + offset) % n, end: (a + len - 1 + offset) % n, ...oligoInfo(rec, s),
      };
    };
    pairs.push({
      forward: side('LEFT'), reverse: side('RIGHT'),
      product: Number(r[`PRIMER_PAIR_${i}_PRODUCT_SIZE`]),
      penalty: num(r[`PRIMER_PAIR_${i}_PENALTY`]),
      pairDimer: { any: num(r[`PRIMER_PAIR_${i}_COMPL_ANY_TH`]), end: num(r[`PRIMER_PAIR_${i}_COMPL_END_TH`]) },
    });
  }
  return {
    mode: 'flanking', pairs, conditions: CONDITIONS, limits: LIMITS,
    explain: pairs.length ? null : [r.PRIMER_LEFT_EXPLAIN, r.PRIMER_RIGHT_EXPLAIN, r.PRIMER_PAIR_EXPLAIN].filter(Boolean).join(' | '),
  };
}
