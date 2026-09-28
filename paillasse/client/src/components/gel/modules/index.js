// Les modules de l'atelier Gels, dans l'ordre du travail. Chacun : un composant (ses réglages), un résumé
// d'une ligne affiché replié, et un signe « fait ». Ajouter un module = ajouter une ligne ici.
import { Columns4, Image as ImageIcon, LayoutPanelTop, Ruler, Sigma, SlidersHorizontal } from 'lucide-react';
import ImageModule, { imageSummary } from './ImageModule.jsx';
import LanesModule, { lanesSummary } from './LanesModule.jsx';
import SizesModule, { sizesSummary } from './SizesModule.jsx';
import BandsModule, { bandsSummary } from './BandsModule.jsx';
import QuantModule, { quantSummary } from './QuantModule.jsx';
import FigureModule, { figureSummary } from './FigureModule.jsx';

export const MODULES = [
  { key: 'image', title: 'Image', icon: ImageIcon, Component: ImageModule, summary: imageSummary, done: () => false },
  { key: 'lanes', title: 'Pistes', icon: Columns4, Component: LanesModule, summary: lanesSummary, done: (c) => c.state.lanes.length > 0 },
  { key: 'sizes', title: 'Tailles', icon: Ruler, Component: SizesModule, summary: sizesSummary, done: (c) => Boolean(c.results?.calibration) },
  { key: 'bands', title: 'Bandes', icon: SlidersHorizontal, Component: BandsModule, summary: bandsSummary, done: (c) => Boolean(c.results?.lanes.some((l) => l.bands.length)) },
  { key: 'quant', title: 'Quantification', icon: Sigma, Component: QuantModule, summary: quantSummary, done: () => false },
  { key: 'figure', title: 'Figure', icon: LayoutPanelTop, Component: FigureModule, summary: figureSummary, done: () => false },
];
