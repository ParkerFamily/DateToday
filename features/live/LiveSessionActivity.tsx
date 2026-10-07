import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  background,
  font,
  foregroundStyle,
  kerning,
  lineLimit,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type LiveSessionActivityProps = {
  /** "You're live" / "Date planned tonight" */
  headline: string;
  /** "Reynoldstown · Drinks + Food" */
  detail: string;
  /** "2 people like you · 1 new message" — empty when nothing new (Android notification text). */
  activity: string;
  /** "Free until 11 PM" (Android notification title). */
  endsLabel: string;
  /** "11 PM" — the lock screen's headline time; empty when they didn't set one. */
  untilTime: string;
  likes: number;
  messages: number;
  /** Only marks the activity stale; there's no visible countdown. */
  endsAtMs: number;
  boosted: boolean;
};

// Everything must live inside the function: it's compiled to a string and run in the widget extension.
const LiveSessionActivity = (props: LiveSessionActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const dim = Boolean(environment.isLuminanceReduced);
  const white = '#FFFFFF';
  const muted = dim ? '#D4D4D8' : '#A1A1AA';
  const green = dim ? white : '#22E58B';
  const pink = dim ? white : '#F472B6';
  const lavender = dim ? white : '#C4B5FD';
  const brand = {
    type: 'linearGradient' as const,
    colors: dim ? ['#3F3F46', '#3F3F46'] : ['#7C3AED', '#C084FC'],
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 1, y: 1 },
  };
  const hasNews = props.likes > 0 || props.messages > 0;

  const logo = (
    <Text
      modifiers={[
        font({ size: 12, weight: 'black', design: 'rounded' }),
        foregroundStyle(white),
        padding({ horizontal: 6, vertical: 3 }),
        background(brand, shapes.roundedRectangle({ cornerRadius: 7, roundedCornerStyle: 'continuous' })),
      ]}
    >
      d:t
    </Text>
  );

  const livePill = (
    <HStack
      spacing={5}
      modifiers={[
        padding({ horizontal: 8, vertical: 3 }),
        background(dim ? '#27272A' : '#22E58B26', shapes.capsule()),
      ]}
    >
      <Image systemName="circle.fill" size={6} color={green} />
      <Text modifiers={[font({ size: 11, weight: 'heavy' }), kerning(0.8), foregroundStyle(green)]}>
        {props.boosted ? 'LIVE · BOOSTED' : 'LIVE'}
      </Text>
    </HStack>
  );

  const news = hasNews ? (
    <HStack spacing={14}>
      {props.likes > 0 ? (
        <HStack spacing={5}>
          <Image systemName="heart.fill" size={12} color={pink} />
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(white)]}>
            {props.likes === 1 ? '1 person likes you' : String(props.likes) + ' people like you'}
          </Text>
        </HStack>
      ) : null}
      {props.messages > 0 ? (
        <HStack spacing={5}>
          <Image systemName="bubble.left.fill" size={12} color={lavender} />
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(white)]}>
            {props.messages === 1 ? '1 message' : String(props.messages) + ' messages'}
          </Text>
        </HStack>
      ) : null}
    </HStack>
  ) : (
    <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(muted)]}>
      You’re visible to people nearby
    </Text>
  );

  const freeUntil = (size: number) =>
    props.untilTime ? (
      <VStack alignment="trailing" spacing={0}>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), kerning(0.6), foregroundStyle(muted)]}>
          FREE UNTIL
        </Text>
        <Text modifiers={[font({ size, weight: 'bold', design: 'rounded' }), foregroundStyle(white), lineLimit(1)]}>
          {props.untilTime}
        </Text>
      </VStack>
    ) : null;

  return {
    banner: (
      <VStack
        alignment="leading"
        spacing={10}
        modifiers={[padding({ horizontal: 16, vertical: 14 }), activityBackgroundTint(dim ? '#000000' : '#120C22')]}
      >
        <HStack spacing={8}>
          {logo}
          {livePill}
          <Spacer />
        </HStack>
        <HStack alignment="lastTextBaseline" spacing={10}>
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 20, weight: 'bold' }), foregroundStyle(white), lineLimit(1)]}>
              {props.headline}
            </Text>
            <Text modifiers={[font({ size: 13 }), foregroundStyle(muted), lineLimit(1)]}>{props.detail}</Text>
          </VStack>
          <Spacer />
          {freeUntil(26)}
        </HStack>
        {news}
      </VStack>
    ),
    compactLeading: hasNews ? (
      <HStack spacing={3}>
        <Image systemName={props.likes > 0 ? 'heart.fill' : 'bubble.left.fill'} size={12} color={props.likes > 0 ? pink : lavender} />
        <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(white)]}>
          {String(props.likes + props.messages)}
        </Text>
      </HStack>
    ) : (
      <HStack spacing={4}>
        <Image systemName="circle.fill" size={7} color={green} />
        <Text modifiers={[font({ size: 12, weight: 'heavy' }), kerning(0.6), foregroundStyle(green)]}>LIVE</Text>
      </HStack>
    ),
    compactTrailing: props.untilTime ? (
      <Text modifiers={[font({ size: 13, weight: 'semibold', design: 'rounded' }), foregroundStyle(white), lineLimit(1)]}>
        {props.untilTime}
      </Text>
    ) : (
      <Image systemName="bolt.heart.fill" size={12} color={green} />
    ),
    minimal: hasNews ? (
      <Image systemName="heart.fill" size={12} color={pink} />
    ) : (
      <Image systemName="bolt.heart.fill" size={12} color={green} />
    ),
    expandedLeading: (
      <HStack spacing={6} modifiers={[padding({ leading: 4, top: 4 })]}>
        {logo}
        {livePill}
      </HStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={0} modifiers={[padding({ trailing: 4, top: 2 })]}>
        {freeUntil(20)}
      </VStack>
    ),
    expandedBottom: (
      <VStack alignment="leading" spacing={8} modifiers={[padding({ horizontal: 8, bottom: 4 })]}>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 17, weight: 'bold' }), foregroundStyle(white), lineLimit(1)]}>
            {props.headline}
          </Text>
          <Text modifiers={[font({ size: 13 }), foregroundStyle(muted), lineLimit(1)]}>{props.detail}</Text>
        </VStack>
        {news}
      </VStack>
    ),
  };
};

export default createLiveActivity('LiveSessionActivity', LiveSessionActivity);
