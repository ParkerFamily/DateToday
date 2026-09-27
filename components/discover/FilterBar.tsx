import { AppText } from '@/components/ui/AppText';
import { colors, gradients, spacing } from '@/constants/theme';
import { activeFilterLabels } from '@/features/discover/applyFilters';
import { canUseAdvancedFilters } from '@/lib/entitlements';
import { useDiscoverFilters } from '@/store/discoverFilters';
import { useSessionStore } from '@/store/session';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

const SUGGESTIONS = ['Age', 'Verified', 'Tonight’s plan', 'Intent ✦', 'Height ✦'];

/** Always-visible filter entry above the Live feed: bright pill + what's applied. */
export const FilterBar = memo(function FilterBar() {
  const router = useRouter();
  const plus = useSessionStore((s) => canUseAdvancedFilters(s.entitlements));
  const filters = useDiscoverFilters();
  const labels = activeFilterLabels(filters, { plus });
  const open = () => router.push('/filters');

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.length ? `Filters, ${labels.length} on` : 'Filters'}
          onPress={open}
          style={({ pressed }) => [styles.mainPill, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={[...gradients.brand]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mainGrad}
          >
            <Ionicons name="options" size={16} color={colors.white} />
            <AppText style={styles.mainText}>Filters</AppText>
            {labels.length ? (
              <View style={styles.badge}>
                <AppText style={styles.badgeText}>{labels.length}</AppText>
              </View>
            ) : null}
          </LinearGradient>
        </Pressable>

        {(labels.length ? labels : SUGGESTIONS).map((label) => (
          <Pressable
            key={label}
            onPress={open}
            style={({ pressed }) => [
              styles.chip,
              labels.length ? styles.chipOn : styles.chipHint,
              pressed && styles.pressed,
            ]}
          >
            {labels.length ? null : <Ionicons name="add" size={13} color={colors.textSecondary} />}
            <AppText style={[styles.chipText, labels.length ? styles.chipTextOn : null]}>
              {label}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#050506',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    alignItems: 'center',
  },
  mainPill: {
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: colors.brandBright,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  mainGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
  },
  mainText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  badgeText: { color: colors.brand, fontSize: 11, fontWeight: '900' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipOn: {
    borderColor: 'rgba(168,85,247,0.6)',
    backgroundColor: 'rgba(168,85,247,0.16)',
  },
  chipHint: {
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: colors.text },
  pressed: { opacity: 0.8 },
});
