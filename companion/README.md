# SpeakFiction companion

Free phone app for licensed SpeakFiction writers. It does not use one of the three Polar desktop seats. Paste the `SF-` key only as identity for the notes inbox. Do not call Polar activate.

The phone hears the take. Your computer shapes the book. Notes sync as text through your SpeakFiction account. Audio stays on the phone unless you attach it.

On the desktop, open Voice notes to show a QR code and your SF- key. In this app tap Scan QR, or paste the key.

Appearance matches the desktop app: light or dark, plus the same genre palettes.

Speech recognition uses the on-device recognizer when the phone has one. If that is missing, edit the transcript yourself. Do not send audio to a hosted transcriber.

```bash
cd companion
npm install
npx expo start
```

For a public Metro URL the development build can enter (phone does not need the same Wi‑Fi):

```bash
npm run start:tunnel
```

Enter `exps://<subdomain>-anonymous-8081.exp.direct:443` (HTTPS). Do not use `exp://…:80` — iOS blocks that HTTP load. Notes still go to `https://www.readywriter.one` unless `EXPO_PUBLIC_NOTES_URL` is set. The tunnel only works while Metro is running on this computer.
