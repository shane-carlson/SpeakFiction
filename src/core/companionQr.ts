import QRCode from 'qrcode';

export async function companionQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: 256,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1b1714', light: '#ffffff' },
  });
}
