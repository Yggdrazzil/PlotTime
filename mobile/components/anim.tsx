import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View, type ViewStyle, type StyleProp } from 'react-native';
import { useReduceMotion } from '@/lib/useReduceMotion';

// Le fil natif accélère opacity/transform sur mobile ; sur le web (plateforme
// principale) il n'est pas supporté → JS driver pour éviter les warnings.
const NATIVE = Platform.OS !== 'web';

// Barre de progression dont le remplissage s'ANIME quand la valeur change
// (ex. cocher un épisode → la barre se remplit en douceur). `pct` de 0 à 100.
export function AnimatedFill({
  pct,
  color,
  style,
  duration = 480,
}: {
  pct: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  duration?: number;
}) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(pct)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: pct,
      duration: reduce ? 0 : duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // largeur = propriété de layout, jamais le driver natif
    }).start();
  }, [pct, reduce, duration, v]);
  const width = v.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' });
  return <Animated.View style={[style, { width, backgroundColor: color }]} />;
}

// Entrée « pop » d'un écran : léger fondu + montée + scale au montage. Fluide
// et disponible partout (web + natif), contrairement aux transitions natives.
export function Pop({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(1); return; }
    Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE }).start();
  }, [reduce, v]);
  return (
    <Animated.View
      style={[
        { flex: 1, opacity: v },
        {
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Apparition en cascade d'un élément de liste (fondu + petite montée). Le délai
// est plafonné pour que le bas d'une longue liste n'attende pas trop.
export function AppearItem({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { v.setValue(1); return; }
    Animated.timing(v, {
      toValue: 1,
      duration: 300,
      delay: Math.min(index, 8) * 45,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE,
    }).start();
  }, [reduce, index, v]);
  return (
    <Animated.View
      style={[
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Bouton animé : léger enfoncement (scale) au press. Enveloppe un contenu
// pressable pour donner un retour tactile « vivant » sans clignotement.
export function PressBounce({
  children,
  onPress,
  style,
  scaleTo = 0.94,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
}) {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (val: number) =>
    Animated.spring(scale, { toValue: val, useNativeDriver: NATIVE, friction: 6, tension: 180 }).start();
  return (
    <View
      // Pressable-like via onStartShouldSetResponder pour marcher web + natif.
      onStartShouldSetResponder={() => true}
      onResponderGrant={() => !reduce && to(scaleTo)}
      onResponderRelease={() => { if (!reduce) to(1); onPress?.(); }}
      onResponderTerminate={() => !reduce && to(1)}
      style={style}
    >
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </View>
  );
}
