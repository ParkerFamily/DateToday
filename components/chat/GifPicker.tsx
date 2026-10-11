import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';
import type { ChatGif } from '@/features/matches/api';
import { gifUrl, searchGifs } from '@/features/matches/gifs';
import { useAppWindow } from '@/lib/layout';
import { ScaledSheet, rs } from '@/lib/scale';

const SEARCH_DEBOUNCE_MS = 350;
const GRID_GAP = 6;

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (gif: ChatGif) => void;
};

/** Bottom sheet: trending GIFs, or search results as you type. Powered by GIPHY (attribution required). */
export function GifPicker({ visible, onClose, onPick }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useAppWindow();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<ChatGif[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const activeQuery = useRef('');

  const load = useCallback(async (q: string, offset: number) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    activeQuery.current = q;
    setLoading(true);
    setError(null);
    try {
      const page = await searchGifs(q, offset, controller.signal);
      if (controller.signal.aborted) return;
      setGifs((prev) => {
        if (!offset) return page.gifs;
        const seen = new Set(prev.map((g) => g.id));
        return [...prev, ...page.gifs.filter((g) => !seen.has(g.id))];
      });
      setNext(page.next);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Couldn’t load GIFs right now.');
    } finally {
      if (request.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => void load(query.trim(), 0), query.trim() ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [visible, query, load]);

  useEffect(() => {
    if (visible) return;
    request.current?.abort();
    setQuery('');
    setGifs([]);
    setNext(null);
    setError(null);
  }, [visible]);

  const columnWidth = Math.floor((width - rs(spacing.md) * 2 - rs(GRID_GAP)) / 2);

  const loadMore = () => {
    if (loading || next == null || error) return;
    void load(activeQuery.current, next);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close GIFs" />
          <View style={[styles.sheet, { height: Math.round(height * 0.72), paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={styles.handle} />
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={rs(18)} color={colors.textSecondary} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search GIPHY"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.searchInput}
                  autoCorrect={false}
                  returnKeyType="search"
                  maxLength={50}
                />
                {query ? (
                  <Pressable hitSlop={10} onPress={() => setQuery('')} accessibilityLabel="Clear search">
                    <Ionicons name="close-circle" size={rs(18)} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button">
                <AppText style={styles.cancel}>Cancel</AppText>
              </Pressable>
            </View>

            <FlatList
              data={gifs}
              keyExtractor={(g) => g.id}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.grid}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              onEndReached={loadMore}
              onEndReachedThreshold={0.6}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send this GIF"
                  onPress={() => onPick(item)}
                  style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
                >
                  <Image
                    source={{ uri: gifUrl(item.id, 'thumb') }}
                    recyclingKey={item.id}
                    style={{ width: columnWidth, height: Math.min(columnWidth * 1.4, (columnWidth * item.h) / item.w) }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </Pressable>
              )}
              ListEmptyComponent={
                loading ? null : (
                  <View style={styles.empty}>
                    <AppText style={styles.emptyText}>
                      {error ?? (query.trim() ? 'No GIFs found. Try another word.' : 'No GIFs right now.')}
                    </AppText>
                    {error ? (
                      <Pressable onPress={() => void load(query.trim(), 0)} hitSlop={8}>
                        <AppText style={styles.retry}>Try again</AppText>
                      </Pressable>
                    ) : null}
                  </View>
                )
              }
              ListFooterComponent={
                loading ? <ActivityIndicator color={colors.brandBright} style={styles.spinner} /> : null
              }
            />
            <AppText style={styles.attribution}>Powered by GIPHY</AppText>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = ScaledSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5, 3, 7, 0.55)' },
  sheet: {
    maxHeight: '100%',
    flexShrink: 1,
    borderTopLeftRadius: radii.surface,
    borderTopRightRadius: radii.surface,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    backgroundColor: colors.border,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: radii.input,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
  cancel: { color: colors.textSecondary, fontSize: 15, fontWeight: '700' },
  grid: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: GRID_GAP },
  gridRow: { gap: GRID_GAP, alignItems: 'flex-start' },
  tile: { borderRadius: 10, overflow: 'hidden', backgroundColor: colors.card },
  pressed: { opacity: 0.75 },
  empty: { alignItems: 'center', gap: 10, paddingTop: spacing.xl },
  emptyText: { color: colors.textSecondary, fontSize: 15, textAlign: 'center' },
  retry: { color: colors.brandBright, fontSize: 15, fontWeight: '800' },
  spinner: { marginVertical: spacing.md },
  attribution: {
    alignSelf: 'center',
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    paddingTop: 6,
  },
});
