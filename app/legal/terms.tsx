import React from 'react';
import { Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import {
  LegalP,
  LegalScreen,
  LegalSection,
  SettingsGroup,
  SettingsRow,
} from '@/components/settings/SettingsUI';
import { LEGAL_URLS, LEGAL_VERSIONS, SUPPORT } from '@/constants/legal';

function subscriptionBillingCopy() {
  if (Platform.OS === 'ios') {
    return 'DateToday+ (Weekly and Monthly) and Tonight Boost are auto-renewable purchases billed through the App Store. Payment is charged to your Apple ID at confirmation of purchase. Subscriptions renew automatically until you cancel. Manage or cancel in your Apple ID subscription settings; store terms (including Apple’s Standard EULA) apply. Deleting your DateToday account does not cancel an App Store subscription.';
  }
  if (Platform.OS === 'android') {
    return 'DateToday+ (Weekly and Monthly) and Tonight Boost are auto-renewable purchases billed through Google Play. Payment is charged to your Google account at confirmation of purchase. Subscriptions renew automatically until you cancel. Manage or cancel in your Google Play subscription settings. Deleting your DateToday account does not cancel a Play subscription.';
  }
  return 'DateToday+ (Weekly and Monthly) and Tonight Boost are paid features. On mobile they are billed through the App Store or Google Play, as applicable. Where DateToday offers web checkout, billing is handled by that checkout provider. Subscriptions renew automatically until you cancel. Manage or cancel in the account where you subscribed. Deleting your DateToday account does not cancel a store or web subscription.';
}

export default function TermsOfServiceScreen() {
  const router = useRouter();

  return (
    <LegalScreen
      title="Terms of Service"
      subtitle={`Version ${LEGAL_VERSIONS.terms}. By using DateToday you agree to these terms.`}
    >
      <LegalSection title="1. Eligibility">
        <LegalP>
          You must be at least 18 years old to create an account or use DateToday. We may ask you to confirm
          your age and optionally verify identity through Persona.
        </LegalP>
      </LegalSection>

      <LegalSection title="2. The service">
        <LegalP>
          DateToday helps people go live, discover people nearby, match, chat, and plan real-world meetups —
          including dating, Friend Dates, and other plans the product supports. Features may change. Paid
          features such as DateToday+ and Tonight Boost are described in Subscriptions & purchases below.
        </LegalP>
      </LegalSection>

      <LegalSection title="3. Accounts">
        <LegalP>
          You are responsible for your login credentials and for activity on your account. Sign-in uses Firebase
          Authentication (email/password, Google, and/or Apple when enabled). Keep your email accurate for
          account recovery and security notices.
        </LegalP>
      </LegalSection>

      <LegalSection title="4. Community Guidelines & prohibited conduct">
        <LegalP>
          You must follow the Community Guidelines. DateToday prohibits harassment, stalking, threats,
          intimidation, violence, sexual harassment or sexual misconduct, hate speech, discrimination,
          impersonation, fraud, scams, coercion, unwanted repeated contact, sharing another person’s private
          information without permission, and using DateToday to facilitate illegal activity. These rules apply
          to conduct inside DateToday and to conduct connected to meetings, chats, or plans arranged through
          DateToday — including Dating, Friend Date, and group or platonic plans. We may remove content, limit
          features, or suspend or permanently remove accounts that violate these terms or create safety risk.
        </LegalP>
      </LegalSection>

      <LegalSection title="5. User interactions and safety">
        <LegalP>
          DateToday does not control the conduct of its users and does not guarantee the identity, intentions,
          compatibility, conduct, or safety of any user. DateToday does not guarantee that another user will
          behave appropriately or lawfully. You are responsible for your interactions with other users,
          including chats, likes, plans, dates, Friend Dates, group activities, and other online or in-person
          interactions. Use reasonable judgment and safety precautions when communicating or meeting. Prefer
          public places when appropriate, and avoid sharing sensitive personal information too quickly.
        </LegalP>
      </LegalSection>

      <LegalSection title="6. Offline meetings">
        <LegalP>
          DateToday helps people connect and make plans. DateToday is not physically present at dates, Friend
          Dates, group hangouts, restaurants, events, activities, or other meetings. You choose whether, when,
          and where to meet. You are responsible for using reasonable judgment before and during any in-person
          meeting. See Safety Tips in the app for practical guidance.
        </LegalP>
      </LegalSection>

      <LegalSection title="7. Blocking, reporting, and enforcement">
        <LegalP>
          You can block and report other users in the app. DateToday may review reports, restrict accounts,
          suspend accounts, permanently remove accounts, preserve information where legally required, and
          cooperate with law enforcement where required by law. We do not promise that every report will result
          in removal or a particular outcome. False or abusive reports may themselves lead to enforcement.
        </LegalP>
      </LegalSection>

      <LegalSection title="8. Verification is not a background check">
        <LegalP>
          Optional identity or age verification (for example through Persona) may help confirm certain account
          or profile information and may show a verified badge. Verification is not a criminal background check
          and is not a guarantee of identity, character, safety, criminal history, or future conduct. We do not
          claim that DateToday performs background checks on every user.
        </LegalP>
      </LegalSection>

      <LegalSection title="9. Location">
        <LegalP>
          Location data may be used to provide nearby discovery, Live Tonight, Travel Mode, venue or event
          recommendations, and related features. DateToday is designed not to reveal your exact private location
          to another user unless you intentionally share it (for example in chat or when choosing a meetup
          place). Use caution before sharing home or work addresses or other precise personal locations.
        </LegalP>
      </LegalSection>

      <LegalSection title="10. User content">
        <LegalP>
          You retain rights to photos, videos, and text you upload. You grant DateToday a limited license to
          host, display, and process that content so the product can work (profiles, discovery, messaging when
          enabled). Do not upload content you do not have rights to share.
        </LegalP>
      </LegalSection>

      <LegalSection title="11. Subscriptions & purchases">
        <LegalP>{subscriptionBillingCopy()}</LegalP>
        {Platform.OS === 'ios' ? (
          <LegalP>
            Current prices are shown in the App Store and in the app at purchase time. They may vary by region
            and can change.
          </LegalP>
        ) : (
          <LegalP>
            Current prices are shown in the store or checkout flow at purchase time. They may vary by region and
            can change.
          </LegalP>
        )}
      </LegalSection>

      <LegalSection title="12. Assumption of risk & disclaimers">
        <LegalP>
          You acknowledge that meeting people online and offline involves risks. The service is provided “as is”
          to the extent allowed by law. We do not guarantee matches, dates, continuous availability, or that
          every profile is accurate or verified.
        </LegalP>
        <LegalP>
          To the fullest extent permitted by applicable law, DateToday is not responsible for the conduct of
          users or for harm arising from interactions between users, except where liability cannot legally be
          excluded or limited. Nothing in these terms is intended to exclude or limit liability that applicable
          law does not allow to be excluded or limited.
        </LegalP>
      </LegalSection>

      <LegalSection title="13. Emergencies">
        <LegalP>
          DateToday is not an emergency service. If you believe you are in immediate danger or experiencing an
          emergency, contact local emergency services (in the United States, dial 911).
        </LegalP>
      </LegalSection>

      <LegalSection title="14. Termination">
        <LegalP>
          You may delete your account in Settings. We may suspend or terminate accounts that violate these terms,
          Community Guidelines, or applicable law. Some records (for example safety reports) may be retained as
          described in the Privacy Policy.
        </LegalP>
      </LegalSection>

      <LegalSection title="15. Contact">
        <LegalP>{`Questions about these Terms: ${SUPPORT.email}.`}</LegalP>
      </LegalSection>

      <SettingsGroup title="Related">
        <SettingsRow label="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
        <SettingsRow label="Community Guidelines" onPress={() => router.push('/legal/guidelines')} />
        <SettingsRow label="Safety Tips" onPress={() => router.push('/safety/tips')} />
        {Platform.OS === 'ios' ? (
          <SettingsRow
            label="Apple Standard EULA"
            onPress={() => void Linking.openURL(LEGAL_URLS.appleStandardEula)}
          />
        ) : null}
        <SettingsRow
          label="Open hosted terms URL"
          last
          onPress={() => void Linking.openURL(LEGAL_URLS.termsOfService)}
        />
      </SettingsGroup>
    </LegalScreen>
  );
}
