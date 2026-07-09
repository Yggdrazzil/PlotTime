import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, View, type ScrollView } from 'react-native';
import { COLS, CELL_W, GRID_GAP, GRID_SIDE } from '@/components/library';

// Grille 3 colonnes réordonnable par glisser-déposer (écran « Faites glisser et
// déposez... » façon TV Time). Sans dépendance : Animated + PanResponder, donc
// compatible web (souris/tactile) ET natif. Un appui long « soulève » l'affiche,
// les autres glissent en ressort vers leur nouvelle place, le dépôt appelle
// `onReorder` avec le nouvel ordre.
export function DragGrid<T>({
  data,
  keyOf,
  renderItem,
  cellHeight,
  onReorder,
  onDragStateChange,
  scrollRef,
  scrollOffsetRef,
}: {
  data: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  cellHeight: number;
  onReorder: (items: T[]) => void;
  // Le parent désactive son scroll pendant le drag (sinon les deux se battent).
  onDragStateChange?: (dragging: boolean) => void;
  // Pour l'auto-défilement quand on traîne une affiche près des bords.
  scrollRef?: React.RefObject<ScrollView | null>;
  scrollOffsetRef?: React.MutableRefObject<number>;
}) {
  const keys = useMemo(() => data.map(keyOf), [data, keyOf]);
  const byKey = useMemo(() => new Map(data.map((it) => [keyOf(it), it])), [data, keyOf]);
  const [order, setOrder] = useState<string[]>(keys);
  const orderRef = useRef(order);
  orderRef.current = order;
  // Nouvelle donnée (ajout/retrait de favori, refetch) : on repart de l'ordre serveur.
  useEffect(() => {
    setOrder((prev) => (prev.length === keys.length && prev.every((k) => byKey.has(k)) ? prev : keys));
  }, [keys, byKey]);

  const posFor = (index: number) => ({
    x: GRID_SIDE + (index % COLS) * (CELL_W + GRID_GAP),
    y: Math.floor(index / COLS) * (cellHeight + GRID_GAP),
  });

  // Une position animée par élément, calée sur sa place dans `order`.
  const positions = useRef(new Map<string, Animated.ValueXY>()).current;
  for (const k of keys) if (!positions.has(k)) positions.set(k, new Animated.ValueXY(posFor(order.indexOf(k))));

  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const dragging = useRef<{
    key: string;
    grabDX: number; // position du doigt dans la cellule saisie
    grabDY: number;
    containerX: number; // origine du conteneur à l'écran
    containerY: number;
    startScroll: number;
  } | null>(null);
  const containerRef = useRef<View>(null);

  const springTo = (key: string, index: number) =>
    Animated.spring(positions.get(key)!, { toValue: posFor(index), useNativeDriver: false, friction: 9, tension: 90 }).start();

  const startDrag = (key: string, pageX: number, pageY: number) => {
    containerRef.current?.measureInWindow((cx, cy) => {
      const idx = orderRef.current.indexOf(key);
      const p = posFor(idx);
      const scroll = scrollOffsetRef?.current ?? 0;
      dragging.current = {
        key,
        grabDX: pageX - cx - p.x,
        grabDY: pageY - (cy + p.y - scroll),
        containerX: cx,
        containerY: cy + scroll, // origine du contenu (indépendante du scroll courant)
        startScroll: scroll,
      };
      setDraggingKey(key);
      onDragStateChange?.(true);
    });
  };

  const moveDrag = (pageX: number, pageY: number) => {
    const d = dragging.current;
    if (!d) return;
    const scroll = scrollOffsetRef?.current ?? 0;
    const x = pageX - d.containerX - d.grabDX;
    const y = pageY - (d.containerY - scroll) - d.grabDY;
    positions.get(d.key)!.setValue({ x, y });

    // Auto-défilement près des bords de l'écran (petits pas à chaque mouvement).
    if (scrollRef?.current && scrollOffsetRef) {
      const winH = typeof window !== 'undefined' ? window.innerHeight : 800;
      const step = pageY < 140 ? -14 : pageY > winH - 140 ? 14 : 0;
      if (step !== 0) scrollRef.current.scrollTo({ y: Math.max(0, scroll + step), animated: false });
    }

    // Indice survolé = centre de la cellule traînée, borné à la grille.
    const cx = x + CELL_W / 2;
    const cy = y + cellHeight / 2;
    const col = Math.min(COLS - 1, Math.max(0, Math.round((cx - GRID_SIDE) / (CELL_W + GRID_GAP))));
    const row = Math.max(0, Math.round((cy - cellHeight / 2) / (cellHeight + GRID_GAP)));
    const target = Math.min(orderRef.current.length - 1, row * COLS + col);
    const from = orderRef.current.indexOf(d.key);
    if (target !== from) {
      const next = [...orderRef.current];
      next.splice(from, 1);
      next.splice(target, 0, d.key);
      setOrder(next);
      orderRef.current = next;
      // Les autres affiches glissent vers leur nouvelle place.
      next.forEach((k, i) => {
        if (k !== d.key) springTo(k, i);
      });
    }
  };

  const endDrag = () => {
    const d = dragging.current;
    if (!d) return;
    dragging.current = null;
    setDraggingKey(null);
    onDragStateChange?.(false);
    springTo(d.key, orderRef.current.indexOf(d.key));
    onReorder(orderRef.current.map((k) => byKey.get(k)!).filter(Boolean));
  };

  // Le conteneur capte les mouvements dès qu'un appui long a « soulevé » une
  // affiche (il vole le geste au ScrollView parent).
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: () => !!dragging.current,
      onPanResponderMove: (e) => moveDrag(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderRelease: endDrag,
      onPanResponderTerminate: endDrag,
    }),
  ).current;

  const rows = Math.ceil(order.length / COLS);
  const height = rows * (cellHeight + GRID_GAP);

  return (
    <View ref={containerRef} style={{ height }} {...pan.panHandlers}>
      {order.map((k) => {
        const item = byKey.get(k);
        if (!item) return null;
        const lifted = draggingKey === k;
        return (
          <Animated.View
            key={k}
            style={[
              { position: 'absolute', width: CELL_W, height: cellHeight },
              { transform: positions.get(k)!.getTranslateTransform() },
              lifted
                ? { zIndex: 10, elevation: 8, transform: [...positions.get(k)!.getTranslateTransform(), { scale: 1.06 }] }
                : null,
            ]}
          >
            <Pressable
              style={{ flex: 1 }}
              delayLongPress={160}
              onLongPress={(e) => startDrag(k, e.nativeEvent.pageX, e.nativeEvent.pageY)}
            >
              {renderItem(item)}
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}
