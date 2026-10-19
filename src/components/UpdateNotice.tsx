import { useEffect, useState } from 'react';
import { applyUpdate, onUpdateReady } from '../pwa';

export function UpdateNotice() {
  const [ready, setReady] = useState(false);
  useEffect(() => onUpdateReady(setReady), []);
  if (!ready) return null;
  return <div className="update-notice" role="status">Update available <button type="button" onClick={applyUpdate}>Reload</button></div>;
}
