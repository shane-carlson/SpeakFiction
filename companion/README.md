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

## App Store and Google Play

The companion is an Expo app. Store binaries are EAS **production** builds (AAB on Play, IPA on App Store). Development client builds stay on the `development` profile.

Privacy policy (required by both stores):

`https://www.readywriter.one/sidequests/speakfiction/privacy`

Support / marketing URL:

`https://www.readywriter.one/sidequests/speakfiction`

### One-time accounts

1. **Expo** — `npm i -g eas-cli` then `eas login`. From `companion/`, `eas init` writes `extra.eas.projectId` into `app.json`.
2. **Apple** — App Store Connect app named **SpeakFiction Notes**, bundle ID `one.readywriter.speakfiction.companion`, team `AM3TB889SG`. Category: Productivity. Age: 12+ (infrequent mild/mature themes in the writer’s own fiction, not in the app). Encryption: only standard HTTPS plus on-device AES for the notes inbox (exempt). Paste the privacy URL. Screenshots: 6.7" iPhone and 13" iPad, portrait, from a real take.
3. **Google** — Play Console app, package `one.readywriter.speakfiction.companion`, default language English. Form factor phone. Data safety: no ads, no advertising ID, microphone and camera used in-app, user content (encrypted notes) optional, data encrypted in transit. Upload the privacy URL. Internal testing track first.

### Build and submit

```bash
cd companion
node scripts/prepare-store-icons.cjs   # once, if icons still have black corners
npx eas-cli build --profile production --platform all
npx eas-cli submit --profile production --platform ios
npx eas-cli submit --profile production --platform android
```

Apple submit uses the existing App Store Connect API key (same team as desktop notarization). Play submit needs a Google service account JSON in EAS credentials (`eas credentials -p android`). First Android upload can also be a manual AAB to the internal track.

### Store listing copy

**Name:** SpeakFiction Notes

**Subtitle:** Voice notes for your novel

**Description:**
SpeakFiction Notes is the free phone companion for SpeakFiction on Mac and Windows. Record a take on the phone. Speech becomes text here. The desktop app shapes the book.

Scan the QR code on your computer, or paste your SF- license key. Notes sync as encrypted text through your SpeakFiction account. Audio stays on this phone unless you attach it. This app does not use one of the three Polar desktop seats.

On-device speech recognition when the phone has it. No hosted transcriber. No ads.

Requires SpeakFiction on the computer (15-day trial, then a one-time license).

**Keywords (iOS):** dictation,writer,fiction,novel,notes,voice,scrivener,manuscript

