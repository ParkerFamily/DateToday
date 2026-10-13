import { Ionicons } from '@expo/vector-icons';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/theme';
import { rs, ScaledSheet } from '@/lib/scale';

/** "FRIEND DATE · PLATONIC" pill on cards, likes, matches and the chat header. */
export function FriendDateTag({
  platonic = false,
  style,
}: {
  /** Adds "· PLATONIC" where intent must be unmistakable (discovery cards). */
  platonic?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.tag, style]}
      accessibilityRole="text"
      accessibilityLabel={platonic ? 'Friend Date, platonic plans only' : 'Friend Date'}
    >
      <Ionicons name="people" size={rs(12)} color={colors.friend} />
      <AppText style={styles.text} numberOfLines={1}>
        {platonic ? 'FRIEND DATE · PLATONIC' : 'FRIEND DATE'}
      </AppText>
    </View>
  );
}

const styles = ScaledSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(20,184,166,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.42)',
  },
  text: {
    color: colors.friend,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
