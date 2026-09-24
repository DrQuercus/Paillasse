import { ChevronRight } from 'lucide-react';
import { Section } from './controls.jsx';
import {
  AngleRange, CropButtons, DisplayControls, LaneButtons, LaneList, LaneWidthRange, OrientationButtons, PolarityControl,
} from './StepsPrepare.jsx';
import { DetectionControls, LadderControls, QuantControls } from './StepsMeasure.jsx';

/**
 * Analyse rapide : tous les réglages essentiels sur un seul panneau, comme dans l'analyseur
 * d'origine. Les pistes sont détectées et le dernier marqueur appliqué à l'ouverture ;
 * le reste (courbure, gamme étalon, tailles attendues, figure) est dans le mode pas à pas.
 */
export default function QuickPanel({ ctx, onFigure }) {
  const { state, info, uncropped, tool } = ctx;
  return (
    <div className="gel-quick">
      <Section title="Image" aside={<span className="gel-badge" title={info.filename}>{info.format}{info.bits ? ` · ${info.bits} bits` : ''}</span>}>
        <div className="gel-quick-row">
          <OrientationButtons ctx={ctx} />
          <CropButtons ctx={ctx} />
        </div>
        {tool === 'crop' && <p className="hint">Image entière affichée : {uncropped.width} × {uncropped.height} px.</p>}
        <AngleRange ctx={ctx} />
        <PolarityControl ctx={ctx} />
      </Section>

      <Section title={`Pistes${state.lanes.length ? ` (${state.lanes.length})` : ''}`}>
        <LaneButtons ctx={ctx} />
        <LaneWidthRange ctx={ctx} />
        <LaneList ctx={ctx} />
      </Section>

      <Section title="Tailles">
        <LadderControls ctx={ctx} compact />
      </Section>

      <Section title="Bandes">
        <DetectionControls ctx={ctx} compact />
        <QuantControls ctx={ctx} />
      </Section>

      <Section title="Affichage" open={false} aside={<span className="gel-badge">sans effet sur les mesures</span>}>
        <DisplayControls ctx={ctx} />
      </Section>

      <div className="gel-quick-foot">
        <button type="button" className="btn gel-next" onClick={onFigure}>
          Mise en page de la figure <ChevronRight size={15} />
        </button>
        <p className="hint">Courbure, zone de migration, gamme étalon et tailles attendues : présentation « Pas à pas ».</p>
      </div>
    </div>
  );
}
