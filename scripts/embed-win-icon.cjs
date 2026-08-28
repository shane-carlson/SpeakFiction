#!/usr/bin/env node
// Wine rcedit (electron-builder on Mac) truncates 128/256 ICO images in the
// exe. Windows then rejects the whole icon group and shows a blank document.
// Rewrite RT_GROUP_ICON from the full .ico with resedit (pure JS, no Wine).
const fs = require('node:fs');
const path = require('node:path');

function loadResedit() {
  try {
    return require('resedit');
  } catch (err) {
    throw new Error(`resedit is required to embed the Windows app icon: ${err.message}`);
  }
}

function listPeIconEntries(exeBuf) {
  const ResEdit = loadResedit();
  const exe = ResEdit.NtExecutable.from(exeBuf, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  return groups.flatMap((group) =>
    group.icons.map((icon) => ({
      groupId: group.id,
      lang: group.lang,
      width: icon.width,
      height: icon.height,
      dataSize: icon.dataSize,
    })),
  );
}

/** ICO directory sizes that are missing or truncated in the PE icon group. */
function iconGroupGaps(peIcons, icoEntries) {
  return icoEntries.filter((entry) => {
    const width = entry.size >= 256 ? 0 : entry.size;
    return !peIcons.some((pe) => (pe.width === entry.size || pe.width === width) && pe.dataSize === entry.bytes);
  });
}

function embedWinIcon(exePath, icoPath) {
  const ResEdit = loadResedit();
  const { listIcoEntries } = require('./make-ico.cjs');
  if (!fs.existsSync(exePath)) throw new Error(`Missing exe: ${exePath}`);
  if (!fs.existsSync(icoPath)) throw new Error(`Missing ico: ${icoPath}`);

  const icoBuf = fs.readFileSync(icoPath);
  const icoEntries = listIcoEntries(icoBuf);
  if (!icoEntries.length) throw new Error(`No icon images in ${icoPath}`);

  const exeBuf = fs.readFileSync(exePath);
  const before = listPeIconEntries(exeBuf);
  const exe = ResEdit.NtExecutable.from(exeBuf, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups[0]?.id ?? 1;
  const lang = groups[0]?.lang ?? 1033;
  const iconFile = ResEdit.Data.IconFile.from(icoBuf);
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    groupId,
    lang,
    iconFile.icons.map((item) => item.data),
  );
  res.outputResource(exe);

  const out = Buffer.from(exe.generate());
  const after = listPeIconEntries(out);
  const gaps = iconGroupGaps(after, icoEntries);
  if (gaps.length) {
    throw new Error(
      `Windows exe icon still incomplete after embed (${gaps.map((g) => `${g.size}px`).join(', ')})`,
    );
  }

  const tmp = `${exePath}.${process.pid}.ico-tmp`;
  fs.writeFileSync(tmp, out);
  fs.renameSync(tmp, exePath);
  return { before, after, gaps: iconGroupGaps(before, icoEntries) };
}

function main() {
  const exePath = process.argv[2];
  const icoPath = process.argv[3];
  if (!exePath || !icoPath) {
    console.error('Usage: node scripts/embed-win-icon.cjs <SpeakFiction.exe> <icon.ico>');
    process.exit(1);
  }
  const result = embedWinIcon(path.resolve(exePath), path.resolve(icoPath));
  const fixed = result.gaps.map((g) => `${g.size}px`).join(', ') || 'none';
  console.log(`Embedded ${result.after.length} icon sizes into ${exePath} (was truncated: ${fixed})`);
}

if (require.main === module) main();

module.exports = {
  listPeIconEntries,
  iconGroupGaps,
  embedWinIcon,
};
