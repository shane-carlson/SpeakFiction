import { useEffect, useState } from 'react';
import { companionQrDataUrl } from '../core/companionQr';

export function CompanionLinkSetup({ paired }: { paired: boolean }) {
  const [key, setKey] = useState('');
  const [qr, setQr] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const bridge = window.speakfiction?.notes;
      if (!bridge?.getPairing) {
        setMessage('Open the SpeakFiction desktop app to show the QR code and your SF- key.');
        return;
      }
      const pairing = await bridge.getPairing();
      if (cancelled) return;
      if (!pairing.ok || !pairing.key || !pairing.payload) {
        setMessage(pairing.message || 'Activate a license on this computer first.');
        setKey('');
        setQr('');
        return;
      }
      setKey(pairing.key);
      setMessage(null);
      setQr(await companionQrDataUrl(pairing.payload));
    })();
    return () => {
      cancelled = true;
    };
  }, [paired]);

  const copyKey = async () => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="card companion-link">
      <h3>Link the phone companion</h3>
      <p className="sub">
        The phone is included with a license and does not use a desktop seat. Scan this code in
        SpeakFiction Notes, or copy the SF- key and paste it there. That only identifies the inbox.
        It does not activate Polar on the phone.
      </p>
      <ol className="companion-link-steps">
        <li>Open SpeakFiction Notes on the phone.</li>
        <li>Tap Scan or paste key.</li>
        <li>Paste the SF- key, or point the camera at this computer.</li>
      </ol>
      {message ? <p className="hint">{message}</p> : null}
      {key ? (
        <div className="companion-link-tools">
          {qr ? (
            <img className="companion-qr" src={qr} alt="QR code that links the phone companion" width={220} height={220} />
          ) : (
            <div className="companion-qr companion-qr-wait">Preparing QR…</div>
          )}
          <div className="companion-key-block">
            <label htmlFor="companion-sf-key">Your SF- key</label>
            <input
              id="companion-sf-key"
              type={revealed ? 'text' : 'password'}
              value={key}
              readOnly
              autoComplete="off"
              spellCheck={false}
            />
            <div className="row wrap">
              <button type="button" className="btn" onClick={() => setRevealed((open) => !open)}>
                {revealed ? 'Hide key' : 'Show SF- key'}
              </button>
              <button type="button" className="btn" onClick={() => void copyKey()}>
                {copied ? 'Copied' : 'Copy key'}
              </button>
            </div>
            <p className="hint">
              Treat this like a password. Anyone with the key can send notes to your inbox.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
