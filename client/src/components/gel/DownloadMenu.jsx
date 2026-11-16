import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileImage, FileSpreadsheet, ImageDown, LineChart, Loader2 } from 'lucide-react';
import { buildSummary } from '../../lib/gel/model.js';
import { canvasToBlob, drawGelFigure } from '../../lib/gel/render.js';
import { download, downloadWholeFigure, figureFilename, panelSvg, tableCsv } from './figureExport.js';

const ITEMS = [
  ['figure-png', ImageDown, 'Figure entière (PNG)', 'Titre, panneaux, tableau et notes, haute définition'],
  ['figure-svg', FileImage, 'Figure entière (SVG)', 'Graphiques vectoriels : modifiable dans Inkscape, Illustrator'],
  ['gel', FileImage, 'Gel seul (PNG)', 'Le panneau du gel, tel que dans la figure'],
  ['profiles', LineChart, 'Profils (SVG)', 'Le graphique des profils de migration'],
  ['csv', FileSpreadsheet, 'Tableau des bandes (CSV)', 'S’ouvre tel quel dans Excel'],
];

/**
 * Menu « Télécharger » de l'atelier. getData() → { state, img, profiles, results } à jour.
 * Tout est produit dans le navigateur, rien n'est envoyé au serveur.
 */
export default function DownloadMenu({ getData, notify }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const run = async (what) => {
    setOpen(false);
    setBusy(what);
    try {
      const data = getData();
      const { state, img, profiles, results } = data;
      const title = buildSummary(state, results).title;
      if (what === 'figure-png') await downloadWholeFigure(data, 'png');
      else if (what === 'figure-svg') await downloadWholeFigure(data, 'svg');
      else if (what === 'gel') download(await canvasToBlob(drawGelFigure(img, state, profiles, results, { pixelRatio: 2 })), figureFilename(title, 'png').replace('_figure', '_gel'));
      else if (what === 'profiles') download(new Blob([panelSvg('profiles', { state, profiles, results })], { type: 'image/svg+xml' }), figureFilename(title, 'svg').replace('_figure', '_profils'));
      else if (what === 'csv') {
        if (!results.rows.length) throw new Error('Aucune bande à exporter.');
        download(new Blob([`﻿${tableCsv(buildSummary(state, results))}`], { type: 'text/csv' }), figureFilename(title, 'csv').replace('_figure', '_bandes'));
      }
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="tool-menu gel-download" ref={ref}>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen((o) => !o)} aria-label="Télécharger" title="Télécharger la figure, le gel ou le tableau" aria-haspopup="menu" aria-expanded={open} disabled={Boolean(busy)}>
        {busy ? <Loader2 size={15} className="spin" /> : <Download size={15} />} <span className="gel-download-label">{busy ? 'Préparation…' : 'Télécharger'}</span> <ChevronDown size={13} />
      </button>
      {open && (
        <div className="menu menu-right" role="menu">
          {ITEMS.map(([key, Icon, label, hint]) => (
            <button key={key} type="button" role="menuitem" className="menu-item menu-item-2" onClick={() => run(key)}>
              <Icon size={15} aria-hidden="true" />
              <span><strong>{label}</strong><span>{hint}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
