import { Image, View, type ViewStyle } from 'react-native';

const mic = require('../assets/mic.png');
const resolved = Image.resolveAssetSource(mic);
if (resolved?.uri) void Image.prefetch(resolved.uri);

/** Same studio-mic image on iOS and Android. Matches the desktop record button. */
export function MicIcon({
  size = 46,
  hidden = false,
}: {
  color?: string;
  size?: number;
  hidden?: boolean;
}) {
  return (
    <Image
      source={mic}
      fadeDuration={0}
      style={{
        width: size,
        height: size,
        opacity: hidden ? 0 : 1,
        position: hidden ? 'absolute' : 'relative',
      }}
      resizeMode="contain"
    />
  );
}

export function TrashIcon({ color, size = 22 }: { color: string; size?: number }) {
  const line = { width: 1.7, height: size * 0.34, backgroundColor: color, borderRadius: 1 };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-start', paddingTop: size * 0.04 }}>
      <View
        style={{
          width: size * 0.26,
          height: size * 0.1,
          borderWidth: 1.7,
          borderColor: color,
          borderBottomWidth: 0,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
        }}
      />
      <View style={{ width: size * 0.82, height: size * 0.1, backgroundColor: color, borderRadius: 1, marginTop: 1 }} />
      <View
        style={{
          width: size * 0.64,
          height: size * 0.52,
          borderWidth: 1.7,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: 3,
          borderBottomRightRadius: 3,
          flexDirection: 'row',
          justifyContent: 'space-evenly',
          alignItems: 'flex-start',
          paddingTop: size * 0.08,
        }}
      >
        <View style={line} />
        <View style={line} />
        <View style={line} />
      </View>
    </View>
  );
}

export function PauseIcon({ color, size = 28 }: { color: string; size?: number }) {
  const bar: ViewStyle = {
    width: size * 0.18,
    height: size * 0.58,
    borderRadius: 2,
    backgroundColor: color,
  };
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: size * 0.16 }}>
      <View style={bar} />
      <View style={bar} />
    </View>
  );
}
