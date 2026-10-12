import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SettingsGroup, SettingsHeader, SettingsRow } from '@/components/settings/SettingsUI';
import { SwipeTutorial } from '@/components/discover/SwipeTutorial';
import { colors, spacing } from '@/constants/theme';
import { 
  getAllTutorialStatus, 
  markTutorialCompleted, 
  resetAllTutorials,
  type TutorialType 
} from '@/lib/tutorial';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { ScaledSheet, rs } from '@/lib/scale';

type TutorialInfo = {
  type: TutorialType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const TUTORIALS: TutorialInfo[] = [
  {
    type: 'swipe',
    title: 'Swiping & Matching',
    description: 'Learn how to like, skip, and create matches',
    icon: 'heart',
  },
  {
    type: 'live',
    title: 'Going Live',
    description: 'How to go Live and show you\'re free tonight',
    icon: 'flash',
  },
  {
    type: 'messaging',
    title: 'Messaging & Plans',
    description: 'Chat with matches and make date plans',
    icon: 'chatbubbles',
  },
  {
    type: 'matches',
    title: 'Your Matches',
    description: 'View and manage your connections',
    icon: 'people',
  },
  {
    type: 'profile',
    title: 'Profile Tips',
    description: 'Make a great first impression',
    icon: 'person-circle',
  },
];

export default function TutorialsScreen() {
  const [completionStatus, setCompletionStatus] = useState<Record<TutorialType, boolean>>({
    swipe: false,
    live: false,
    messaging: false,
    matches: false,
    profile: false,
  });
  const [activeTutorial, setActiveTutorial] = useState<TutorialType | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadStatus = useCallback(async () => {
    const status = await getAllTutorialStatus();
    setCompletionStatus(status);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, refreshKey]);

  const handlePlayTutorial = (type: TutorialType) => {
    setActiveTutorial(type);
  };

  const handleTutorialComplete = async () => {
    if (activeTutorial) {
      await markTutorialCompleted(activeTutorial);
      setActiveTutorial(null);
      setRefreshKey(prev => prev + 1);
    }
  };

  const handleTutorialSkip = async () => {
    if (activeTutorial) {
      await markTutorialCompleted(activeTutorial);
      setActiveTutorial(null);
      setRefreshKey(prev => prev + 1);
    }
  };

  const handleResetAll = () => {
    Alert.alert(
      'Reset All Tutorials',
      'This will mark all tutorials as not completed, so they\'ll appear again when you use those features.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset All',
          style: 'destructive',
          onPress: async () => {
            await resetAllTutorials();
            setRefreshKey(prev => prev + 1);
            Alert.alert('Reset Complete', 'All tutorials have been reset.');
          },
        },
      ]
    );
  };

  // Count completed tutorials
  const completedCount = Object.values(completionStatus).filter(Boolean).length;
  const totalCount = TUTORIALS.length;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsHeader
          title="Tutorials"
          subtitle={`${completedCount} of ${totalCount} completed`}
        />

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={rs(20)} color={colors.brandBright} />
          <AppText style={styles.infoText}>
            Watch these quick tutorials anytime to learn how DateToday works
          </AppText>
        </View>

        <SettingsGroup title="Available Tutorials">
          {TUTORIALS.map((tutorial, index) => {
            const completed = completionStatus[tutorial.type];
            return (
              <SettingsRow
                key={tutorial.type}
                label={tutorial.title}
                detail={tutorial.description}
                icon={tutorial.icon}
                last={index === TUTORIALS.length - 1}
                onPress={() => handlePlayTutorial(tutorial.type)}
                trailing={
                  completed ? (
                    <View style={styles.completedBadge}>
                      <Ionicons name="checkmark-circle" size={rs(20)} color={colors.live} />
                    </View>
                  ) : (
                    <View style={styles.playButton}>
                      <Ionicons name="play-circle" size={rs(24)} color={colors.brandBright} />
                    </View>
                  )
                }
              />
            );
          })}
        </SettingsGroup>

        {completedCount > 0 && (
          <View style={styles.resetSection}>
            <Button
              label="Reset All Tutorials"
              variant="ghost"
              onPress={handleResetAll}
            />
            <AppText style={styles.resetHint}>
              This will show tutorials again as if you're a new user
            </AppText>
          </View>
        )}

        <View style={styles.tipBox}>
          <AppText style={styles.tipTitle}>💡 Pro Tip</AppText>
          <AppText style={styles.tipText}>
            Tutorials only appear once when you first use each feature. You can always come back here to watch them again.
          </AppText>
        </View>
      </ScrollView>

      {/* Only Swipe tutorial is implemented for now */}
      {activeTutorial === 'swipe' && (
        <SwipeTutorial
          visible={true}
          onComplete={handleTutorialComplete}
          onSkip={handleTutorialSkip}
        />
      )}

      {/* Placeholder for other tutorials */}
      {activeTutorial && activeTutorial !== 'swipe' && (
        <View style={styles.comingSoon}>
          <View style={styles.comingSoonContent}>
            <Ionicons name="construct" size={rs(64)} color={colors.brandBright} />
            <AppText style={styles.comingSoonTitle}>Tutorial Coming Soon</AppText>
            <AppText style={styles.comingSoonText}>
              The {TUTORIALS.find(t => t.type === activeTutorial)?.title} tutorial is being created.
            </AppText>
            <Button
              label="Got It"
              onPress={() => {
                void handleTutorialComplete();
              }}
              style={styles.comingSoonButton}
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = ScaledSheet.create({
  content: {
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: 12,
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.3)',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  completedBadge: {
    marginLeft: spacing.sm,
  },
  playButton: {
    marginLeft: spacing.sm,
  },
  resetSection: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  resetHint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  tipBox: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  tipTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  tipText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  comingSoon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 5, 8, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  comingSoonContent: {
    alignItems: 'center',
    gap: spacing.md,
    maxWidth: 300,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  comingSoonText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  comingSoonButton: {
    marginTop: spacing.md,
    minWidth: 200,
  },
});
