/**
 * Root Navigator - Auth flow control
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import MaxLoadingView from '../components/MaxLoadingView';
import { colors } from '../theme/dark';

// Screens
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import GoogleCalendarConnectScreen from '../screens/integrations/GoogleCalendarConnectScreen';
import PaymentScreen from '../screens/payment/PaymentScreen';
import ReferralCodeScreen from '../screens/payment/ReferralCodeScreen';
import CreateAccountScreen from '../screens/payment/CreateAccountScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import SettingsScreen from '../screens/profile/SettingsScreen';
import NotificationPreferencesScreen from '../screens/profile/NotificationPreferencesScreen';
import EditPersonalScreen from '../screens/profile/EditPersonalScreen';
import PersonalizationScreen from '../screens/profile/PersonalizationScreen';
import AchievementsScreen from '../screens/profile/AchievementsScreen';
import RanksScreen from '../screens/profile/RanksScreen';
import BlockPreviewScreen from '../screens/dev/BlockPreviewScreen';
import AchievementCelebrationHost from '../components/achievements/AchievementCelebrationHost';
import DayPlannerScreen from '../screens/profile/DayPlannerScreen';
import MyProductsScreen from '../screens/profile/MyProductsScreen';
import ManageSubscriptionScreen from '../screens/profile/ManageSubscriptionScreen';
import PersonalInfoScreen from '../screens/profile/PersonalInfoScreen';
import ProgressArchiveScreen from '../screens/profile/ProgressArchiveScreen';
import ScheduleScreen from '../screens/courses/ScheduleScreen';
import MaxxDetailScreen from '../screens/courses/MaxxDetailScreen';
import MaxDetailScreen from '../screens/marketplace/MaxDetailScreen';
import CreatorApplyScreen from '../screens/marketplace/CreatorApplyScreen';
import CreatorOnboardingScreen from '../screens/creator/CreatorOnboardingScreen';
import InAppNotificationsScreen from '../screens/notifications/InAppNotificationsScreen';
import FitmaxPlanScreen from '../screens/courses/FitmaxPlanScreen';
import FitmaxWorkoutTrackerScreen from '../screens/courses/FitmaxWorkoutTrackerScreen';
import FitmaxCalorieLogScreen from '../screens/courses/FitmaxCalorieLogScreen';
import FitmaxProgressScreen from '../screens/courses/FitmaxProgressScreen';
import FitmaxModuleScreen from '../screens/courses/FitmaxModuleScreen';
import TaskDetailScreen from '../screens/task/TaskDetailScreen';
import TaskGuideScreen from '../screens/task/TaskGuideScreen';
import TabNavigator from './TabNavigator';
import LandingScreen from '../screens/onboarding/LandingScreen';
import LegalDocumentScreen from '../screens/legal/LegalDocumentScreen';
import AdminNavigator from './AdminNavigator';
import { userHasSignupPhone } from '../utils/userPhone';
import OnboardingV2Screen from '../screens/onboarding/OnboardingV2Screen';
import OnboardingCalendarScreen from '../screens/onboarding/OnboardingCalendarScreen';
import CreatorFeedScreen from '../screens/creator/CreatorFeedScreen';
import CreatorPaywallScreen from '../screens/creator/CreatorPaywallScreen';
import CreatorCourseScreen from '../screens/creator/CreatorCourseScreen';
import CreatorMaxxHomeScreen from '../screens/creator/CreatorMaxxHomeScreen';
import StudioHomeScreen from '../screens/creator/StudioHomeScreen';
import ComposerScreen from '../screens/creator/ComposerScreen';
import PostCommentsManagerScreen from '../screens/creator/PostCommentsManagerScreen';
import CourseEditorScreen from '../screens/creator/CourseEditorScreen';
import CreatorSettingsScreen from '../screens/creator/CreatorSettingsScreen';
import HabitsEditorScreen from '../screens/creator/HabitsEditorScreen';
import ChannelsManagerScreen from '../screens/creator/ChannelsManagerScreen';
import ChannelChatScreen from '../screens/forums/ChannelChatScreen';
import WeeklyReviewScreen from '../screens/review/WeeklyReviewScreen';
import DaySetupScreen from '../screens/you/DaySetupScreen';
import { isLapsedUser } from '../lib/lapsed';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
    const { user, isLoading, isAuthenticated, isPaid, isFreeTier, sessionRestorePending } = useAuth();

    if (isLoading) {
        return <MaxLoadingView />;
    }
    // A durable session exists but the boot restore hasn't landed yet (cold
    // backend wake, brief offline). Hold the loading view — mounting the guest
    // stack here dumps a session-holder (possibly a just-paid mid-funnel anon
    // user with NO credentials to sign back in) onto Landing. AuthContext's
    // resume loop retries and caps this, so it cannot spin forever.
    if (!user && sessionRestorePending) {
        return <MaxLoadingView />;
    }

    const onboardingCompleted = user?.onboarding?.completed === true;

    /**
     * Funnel: Landing → Onboarding (intro + first stack) → ReferralCode →
     * Payment → CreateAccount → Onboarding (fine-tune) → Main.
     *
     * Push notifications default to ON for paid users; they can toggle
     * device-level permissions via OS settings. (The old SMS-coaching opt-in
     * funnel was removed — it was unreachable and superseded by push-first.)
     */
    // Paid users get the full stack. A user who explicitly chose "Continue with
    // the free plan" on the paywall (isFreeTier) ALSO enters the Main stack — but
    // browse-only: every real action (start a plan, chat send, …) is bounced back
    // to Payment by usePaywallGate, and paid content stays server-gated.
    // Funnel V4: payment happens MID-funnel (before the account + schedule
    // steps), so being paid isn't enough — onboarding must also be complete, or
    // a user who quit right after purchasing would land on Main with the
    // schedule questions unanswered. Existing paid users all have
    // onboarding.completed, so this changes nothing for them.
    const treatAsFull = (isPaid || isFreeTier) && onboardingCompleted;

    // A LAPSED subscriber: finished onboarding, no entitlement now, but the
    // server remembers a plan (expired / cancelled / refunded status, or a
    // past end date). They go straight to the paywall in its "welcome back"
    // state, which carries Restore, a referral code and a sign-in link.
    const isLapsed = isAuthenticated && !treatAsFull && isLapsedUser(user);

    const initialRoute = !isAuthenticated
        // New users land on the Landing 'Get started' funnel (which mints the
        // anonymous account + starts the questions), not the Login form. Login
        // is still reachable via the 'Sign in' link on Landing.
        ? 'Landing'
        : user?.is_admin
                ? 'Admin'
                : !treatAsFull
                    ? !onboardingCompleted
                        // Funnel V4 buyer who died between paywall and claim (jetsam
                        // behind the Apple sheet, swipe-kill during the ~60s verify,
                        // transient boot-restore failure): they are PAID but have no
                        // credentials yet. Resume at the account-claim step — never at
                        // the front of the funnel. Plain isPaid, NOT a quiz-progress
                        // marker: the quiz draft may be client-side only, so the
                        // server's onboarding can be empty at purchase time.
                        // CreateAccountScreen handles every sub-state:
                        // unclaimed anons get the form; already-claimed users are
                        // forwarded into Onboarding{phase:'schedule'}, which defaults
                        // sanely even with no local draft (reinstall + entitlement
                        // adopted by the launch reconciler before any quiz).
                        ? isPaid
                            ? 'CreateAccount'
                            // The wizard resumes from its own draft (and forwards
                            // to the referral / paywall step it was killed on).
                            : 'Onboarding'
                        : isLapsed
                            ? 'Payment'
                            : 'ReferralCode'
                    : 'Main';

    const stackKey = !isAuthenticated
        ? 'guest'
        : user?.is_admin
            ? 'admin'
            : treatAsFull
                ? 'auth-paid'
                : 'auth-unpaid';

    return (
        <>
        <Stack.Navigator
            key={stackKey}
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
            }}
            initialRouteName={initialRoute}
        >
            {!isAuthenticated ? (
                <>
                    <Stack.Screen name="Landing" component={LandingScreen} />
                    <Stack.Screen name="Login" component={LoginScreen} />
                    <Stack.Screen name="Signup" component={SignupScreen} />
                    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                    <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="LegalDocument" component={LegalDocumentScreen} options={{ headerShown: false }} />
                </>
            ) : user?.is_admin ? (
                <>
                    <Stack.Screen name="Admin" component={AdminNavigator} />
                </>
            ) : !treatAsFull ? (
                <>
                    {/* gestureEnabled:false — the wizard has its own Back control, and
                        a swipe-back from the first question would leave the funnel. */}
                    <Stack.Screen name="Onboarding" component={OnboardingV2Screen} options={{ gestureEnabled: false }} />
                    {/* Account claim after purchase (anon → real login). */}
                    <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
                    {/* Optional calendar connect before the schedule questions (flag onboardingCalendar). */}
                    <Stack.Screen name="OnboardingCalendar" component={OnboardingCalendarScreen} options={{ gestureEnabled: false }} />
                    <Stack.Screen name="ReferralCode" component={ReferralCodeScreen} />
                    <Stack.Screen name="Payment" component={PaymentScreen} />
                    <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="LegalDocument" component={LegalDocumentScreen} options={{ headerShown: false }} />
                </>
            ) : (
                <>
                    <Stack.Screen name="Main" component={TabNavigator} />
                    <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
                    {/* Paid-gated actions (usePaywallGate) bounce free-tier users here, so
                        Payment must be reachable from this stack — not just the funnel. */}
                    <Stack.Screen name="ReferralCode" component={ReferralCodeScreen} />
                    <Stack.Screen name="Payment" component={PaymentScreen} />
                    <Stack.Screen name="Profile" component={ProfileScreen} />
                    <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="EditPersonal" component={EditPersonalScreen} />
                    <Stack.Screen name="Personalization" component={PersonalizationScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="Achievements" component={AchievementsScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="Ranks" component={RanksScreen} options={{ headerShown: false }} />
                    {__DEV__ ? <Stack.Screen name="BlockPreview" component={BlockPreviewScreen} options={{ headerShown: false }} /> : null}
                    <Stack.Screen name="DayPlanner" component={DayPlannerScreen} />
                    <Stack.Screen name="MyProducts" component={MyProductsScreen} />
                    <Stack.Screen name="ManageSubscription" component={ManageSubscriptionScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="PersonalInfo" component={PersonalInfoScreen} />
                    <Stack.Screen name="ProgressArchive" component={ProgressArchiveScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="WeeklyReview" component={WeeklyReviewScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="DaySetup" component={DaySetupScreen} options={{ headerShown: false }} />

                    <Stack.Screen name="Schedule" component={ScheduleScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="TaskGuide" component={TaskGuideScreen} options={{ headerShown: false, presentation: 'modal' }} />
                    <Stack.Screen name="MaxxDetail" component={MaxxDetailScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="MaxDetail" component={MaxDetailScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="CreatorApply" component={CreatorApplyScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="CreatorOnboarding" component={CreatorOnboardingScreen} options={{ headerShown: false, gestureEnabled: false }} />
                    <Stack.Screen name="InAppNotifications" component={InAppNotificationsScreen} options={{ headerShown: false, presentation: 'fullScreenModal' }} />
                    {/* Creator platform — feed/paywall (any subscriber) + studio (creators). */}
                    <Stack.Screen name="CreatorFeed" component={CreatorFeedScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="CreatorPaywall" component={CreatorPaywallScreen} options={{ headerShown: false, presentation: 'modal' }} />
                    <Stack.Screen name="CreatorCourse" component={CreatorCourseScreen} options={{ headerShown: false }} />
                    {/* Member home for a creator maxx (Updates | Course | Community). */}
                    <Stack.Screen name="CreatorMaxxHome" component={CreatorMaxxHomeScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="CreatorStudio" component={StudioHomeScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="CreatorComposer" component={ComposerScreen} options={{ headerShown: false, presentation: 'modal' }} />
                    <Stack.Screen name="CreatorPostComments" component={PostCommentsManagerScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="CreatorCourseEditor" component={CourseEditorScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="CreatorSettings" component={CreatorSettingsScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="CreatorHabitsEditor" component={HabitsEditorScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="CreatorChannelsManager" component={ChannelsManagerScreen} options={{ headerShown: false }} />
                    {/* Community channel chat (shared with AdminNavigator's copy). */}
                    <Stack.Screen name="ChannelChat" component={ChannelChatScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="FitmaxPlan" component={FitmaxPlanScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="FitmaxWorkoutTracker" component={FitmaxWorkoutTrackerScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="FitmaxCalorieLog" component={FitmaxCalorieLogScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="FitmaxProgress" component={FitmaxProgressScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="FitmaxModule" component={FitmaxModuleScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="LegalDocument" component={LegalDocumentScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="GoogleCalendarConnect" component={GoogleCalendarConnectScreen} options={{ headerShown: false }} />
                </>
            )}
        </Stack.Navigator>
        {treatAsFull ? <AchievementCelebrationHost /> : null}
        </>
    );
}

export default RootNavigator;
