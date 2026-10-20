import { Overlay } from './Overlay';
import { Settings } from './Settings';

export function SettingsOverlay({ onClose, onImportKnown }: { onClose: () => void; onImportKnown?: () => void }) {
  return <Overlay label="Settings" onClose={onClose}><Settings onImportKnown={onImportKnown} /></Overlay>;
}
