// Images produites dans le navigateur : canvas → PNG, SVG → PNG (figures de gel, graphiques).

export function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image impossible à produire.'))), type));
}

/** SVG → PNG (×2 par défaut pour un rendu net à l'écran et à l'impression). */
export async function svgToPng(svg, scale = 2) {
  const w = Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? 800);
  const h = Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? 400);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Graphique illisible.')); image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { blob: await canvasToBlob(canvas), width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Téléchargement d'un fichier produit dans le navigateur. */
export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
