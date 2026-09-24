// Gels synthétiques aux quantités connues, pour vérifier le moteur d'analyse.
//
// lanes = [{ x, bands: [{ y, amount, sigma? }] }] ; chaque bande est une gaussienne verticale
// de largeur de piste fixe : son aire dans le profil est proportionnelle à « amount ».

export function synthGel({
  width = 400, height = 500, lanes, laneWidth = 30, polarity = 'dark', max = 65535,
  background = 50000, gain = 1250, noise = 0, smile = 0, slope = 0, clip = true, seed = 1,
}) {
  const data = new Float32Array(width * height);
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const cx = (width - 1) / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let signal = 0;
      for (const lane of lanes) {
        if (Math.abs(x - lane.x) > laneWidth / 2) continue;
        for (const b of lane.bands) {
          const sigma = b.sigma ?? 5;
          const yc = b.y + smile * ((x - cx) / cx) ** 2; // bandes en « sourire »
          signal += (gain * b.amount / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-((y - yc) ** 2) / (2 * sigma * sigma));
        }
      }
      const bg = background + slope * y + noise * gauss();
      let v = polarity === 'dark' ? bg - signal : (max - background) * 0.02 + slope * y + signal + noise * gauss();
      if (clip) v = Math.max(0, Math.min(max, v));
      data[y * width + x] = v;
    }
  }
  return { data, width, height, maxValue: max };
}
