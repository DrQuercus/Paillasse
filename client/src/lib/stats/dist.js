// Lois de probabilité et fonctions spéciales (double précision), pour les tests statistiques.
// Vérifiées contre scipy (client/test/stats.test.js, valeurs de référence dans test/fixtures/stats).

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

/** ln Γ(x) (Lanczos, g = 7). */
export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i += 1) a += LANCZOS[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

const TINY = 1e-300;

function gammaSeries(a, x) {
  let ap = a;
  let del = 1 / a;
  let sum = del;
  for (let n = 0; n < 10000; n += 1) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
}

function gammaFraction(a, x) {
  let b = x + 1 - a;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10000; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

/** Fonction gamma incomplète régularisée P(a, x) et son complément Q(a, x). */
export const gammaP = (a, x) => (x <= 0 ? 0 : x < a + 1 ? gammaSeries(a, x) : 1 - gammaFraction(a, x));
export const gammaQ = (a, x) => (x <= 0 ? 1 : x < a + 1 ? 1 - gammaSeries(a, x) : gammaFraction(a, x));

function betaFraction(a, b, x) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 10000; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

/** Fonction bêta incomplète régularisée I_x(a, b). */
export function betaI(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  if (x < (a + 1) / (a + b + 2)) return (front * betaFraction(a, b, x)) / a;
  return 1 - (front * betaFraction(b, a, 1 - x)) / b;
}

// --- Loi normale ----------------------------------------------------------------------------------

/** Φ(z), algorithme de Hart (précision double), rapide : sert aussi aux intégrales de Tukey et Dunnett. */
export function normCdf(z) {
  const x = Math.abs(z);
  let p;
  if (x > 37) p = 0;
  else {
    const e = Math.exp(-(x * x) / 2);
    if (x < 7.07106781186547) {
      let n = 3.52624965998911e-2 * x + 0.700383064443688;
      n = n * x + 6.37396220353165;
      n = n * x + 33.912866078383;
      n = n * x + 112.079291497871;
      n = n * x + 221.213596169931;
      n = n * x + 220.206867912376;
      let d = 8.83883476483184e-2 * x + 1.75566716318264;
      d = d * x + 16.064177579207;
      d = d * x + 86.7807322029461;
      d = d * x + 296.564248779674;
      d = d * x + 637.333633378831;
      d = d * x + 793.826512519948;
      d = d * x + 440.413735824752;
      p = (e * n) / d;
    } else {
      // Queue extrême : fonction gamma incomplète, exacte en relatif
      p = 0.5 * gammaQ(0.5, (x * x) / 2);
    }
  }
  return z > 0 ? 1 - p : p;
}
export const normSf = (z) => normCdf(-z);
export const normPdf = (z) => Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI);

/** Quantile de la loi normale (Acklam, affiné par deux pas de Halley). */
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  let x;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - low) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // Erreur calculée du côté de la plus petite queue, avec la queue exacte : précision gardée aux extrêmes
  const lower = (z) => (z < -5 ? 0.5 * gammaQ(0.5, (z * z) / 2) : normCdf(z));
  for (let k = 0; k < 2; k += 1) {
    const err = p < 0.5 ? lower(x) - p : (1 - p) - lower(-x);
    const u = err * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
    x -= u / (1 + (x * u) / 2);
  }
  return x;
}

// --- Lois t, F, χ² ---------------------------------------------------------------------------------

/** P(T ≤ t) pour la loi de Student à df degrés de liberté. */
export function tCdf(t, df) {
  if (!Number.isFinite(df)) return normCdf(t);
  const tail = 0.5 * betaI(df / (df + t * t), df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}
/** P bilatéral : P(|T| ≥ |t|). */
export const tP2 = (t, df) => (Number.isFinite(df) ? betaI(df / (df + t * t), df / 2, 0.5) : 2 * normSf(Math.abs(t)));

/** Recherche d'une racine d'une fonction croissante (dichotomie avec élargissement de l'intervalle). */
function invert(f, target, lo = -1, hi = 1) {
  let a = lo;
  let b = hi;
  for (let i = 0; i < 200 && f(a) > target; i += 1) a = a < 0 ? a * 2 : a / 2 - 1;
  for (let i = 0; i < 200 && f(b) < target; i += 1) b = b > 0 ? b * 2 : b / 2 + 1;
  for (let i = 0; i < 200; i += 1) {
    const m = (a + b) / 2;
    if (f(m) < target) a = m; else b = m;
    if (Math.abs(b - a) <= 1e-13 * Math.max(1, Math.abs(m))) break;
  }
  return (a + b) / 2;
}

/** Quantile de Student : t tel que P(T ≤ t) = p. */
export function tInv(p, df) {
  if (!Number.isFinite(df)) return normInv(p);
  const z = normInv(p);
  return invert((t) => tCdf(t, df), p, z - 1 - Math.abs(z) * 3, z + 1 + Math.abs(z) * 3);
}

/** P(F ≥ f) pour la loi de Fisher (d1, d2). */
export const fSf = (f, d1, d2) => (f <= 0 ? 1 : betaI(d2 / (d2 + d1 * f), d2 / 2, d1 / 2));
/** P(χ² ≥ x) à k degrés de liberté. */
export const chi2Sf = (x, k) => (x <= 0 ? 1 : gammaQ(k / 2, x / 2));

// --- Intégration de Gauss-Legendre --------------------------------------------------------------------

function gaussLegendre(n) {
  const x = new Float64Array(n);
  const w = new Float64Array(n);
  for (let i = 0; i < Math.ceil(n / 2); i += 1) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let pp = 0;
    for (let it = 0; it < 100; it += 1) {
      let p1 = 1;
      let p2 = 0;
      for (let j = 1; j <= n; j += 1) {
        const p3 = p2;
        p2 = p1;
        p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j;
      }
      pp = (n * (z * p1 - p2)) / (z * z - 1);
      const z1 = z;
      z = z1 - p1 / pp;
      if (Math.abs(z - z1) < 1e-15) break;
    }
    x[i] = -z;
    x[n - 1 - i] = z;
    w[i] = 2 / ((1 - z * z) * pp * pp);
    w[n - 1 - i] = w[i];
  }
  return { x, w };
}
const GL = gaussLegendre(16);

/** ∫ f sur [a, b], découpé en `panels` intervalles de 16 points. */
function integrate(f, a, b, panels) {
  const h = (b - a) / panels;
  let total = 0;
  for (let p = 0; p < panels; p += 1) {
    const mid = a + (p + 0.5) * h;
    for (let i = 0; i < 16; i += 1) total += GL.w[i] * f(mid + (GL.x[i] * h) / 2);
  }
  return (total * h) / 2;
}

/** Densité de s = √(χ²_ν / ν) (écart-type estimé, rapporté à σ), et son domaine utile. */
function sDensity(df) {
  const c = (df / 2) * Math.log(df) - lgamma(df / 2) - (df / 2 - 1) * Math.LN2;
  const spread = 1 / Math.sqrt(2 * df);
  return {
    f: (s) => (s <= 0 ? 0 : Math.exp(c + (df - 1) * Math.log(s) - (df * s * s) / 2)),
    lo: Math.max(0, 1 - 9 * spread),
    hi: 1 + 12 * spread + (df < 5 ? 6 : 0),
  };
}

// --- Étendue studentisée (Tukey) ------------------------------------------------------------------------

/** P(étendue de k normales centrées réduites < w). */
function rangeCdf(w, k) {
  if (w <= 0) return 0;
  const f = (z) => normPdf(z) * (normCdf(z) - normCdf(z - w)) ** (k - 1);
  return Math.min(1, k * integrate(f, -8.5, 8.5, 10));
}

/** P(Q ≤ q) pour l'étendue studentisée à k moyennes et df degrés de liberté. */
export function ptukey(q, k, df) {
  if (q <= 0) return 0;
  if (!Number.isFinite(df) || df > 5000) return rangeCdf(q, k);
  const { f, lo, hi } = sDensity(df);
  return Math.min(1, integrate((s) => f(s) * rangeCdf(q * s, k), lo, hi, df < 5 ? 16 : 8));
}

/**
 * Racine d'une fonction croissante coûteuse (intégrales) : fausse position « Illinois », qui
 * converge en une dizaine d'évaluations là où la dichotomie en demande une cinquantaine.
 */
function solveCostly(f, target, a0, b0, tol = 1e-10) {
  let a = a0;
  let b = b0;
  let fa = f(a) - target;
  let fb = f(b) - target;
  for (let i = 0; i < 60 && fa > 0; i += 1) { b = a; fb = fa; a /= 2; fa = f(a) - target; }
  for (let i = 0; i < 60 && fb < 0; i += 1) { a = b; fa = fb; b *= 2; fb = f(b) - target; }
  let side = 0;
  for (let i = 0; i < 100; i += 1) {
    const c = (a * fb - b * fa) / (fb - fa);
    const fc = f(c) - target;
    if (Math.abs(fc) < tol || Math.abs(b - a) < tol * Math.max(1, Math.abs(c))) return c;
    if (fc * fb > 0) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; } else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
  }
  return (a + b) / 2;
}

/** Quantile de l'étendue studentisée. */
export function qtukey(p, k, df) {
  return solveCostly((q) => ptukey(q, k, df), p, 1, 6);
}

// --- Dunnett : comparaisons à un témoin ------------------------------------------------------------------

/**
 * P(max |T_i| < c) pour des statistiques t corrélées ρ_ij = λ_i λ_j (comparaisons à un même témoin,
 * λ_i = 1/√(1 + n_témoin/n_i)), df degrés de liberté : intégrale double exacte (pas de simulation).
 */
export function pdunnett(c, lambdas, df) {
  if (c <= 0) return 0;
  const r = lambdas.map((l) => Math.sqrt(1 - l * l));
  const inner = (cs) => integrate((z) => {
    let prod = normPdf(z);
    for (let i = 0; i < lambdas.length; i += 1) {
      prod *= normCdf((cs - lambdas[i] * z) / r[i]) - normCdf((-cs - lambdas[i] * z) / r[i]);
    }
    return prod;
  }, -8.5, 8.5, 14);
  if (!Number.isFinite(df) || df > 5000) return Math.min(1, inner(c));
  const { f, lo, hi } = sDensity(df);
  return Math.min(1, integrate((s) => f(s) * inner(c * s), lo, hi, df < 5 ? 24 : 12));
}

export function qdunnett(p, lambdas, df) {
  return solveCostly((c) => pdunnett(c, lambdas, df), p, 1, 4);
}
