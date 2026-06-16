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
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import FeaturesIntroScreen from '../screens/onboarding/FeaturesIntroScreen';
import RoutineRevealScreen from '../screens/onboarding/RoutineRevealScreen';
import FaceScanScreen from '../screens/scan/FaceScanScreen';
import FaceScanResultsScreen from '../screens/scan/FaceScanResultsScreen';
import SmsCoachingIntroScreen from '../screens/scan/SmsCoachingIntroScreen';
import SendblueConnectScreen from '../screens/scan/SendblueConnectScreen';
import NotificationChannelsScreen from '../screens/scan/NotificationChannelsScreen';
import ModuleSelectScreen from '../screens/scan/ModuleSelectScreen';
import ScanDetailScreen from '../screens/scan/ScanDetailScreen';
import PaymentScreen from '../screens/payment/PaymentScreen';
import PaymentThankYouScreen from '../screens/payment/PaymentThankYouScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import SmsSetupScreen from '../screens/profile/SmsSetupScreen';
import SettingsScreen from '../screens/profile/SettingsScreen';
import EditPersonalScreen from '../screens/profile/EditPersonalScreen';
import PersonalizationScreen from '../screens/profile/PersonalizationScreen';
import AchievementsScreen from '../screens/profile/AchievementsScreen';
import AchievementCelebrationHost from '../components/achievements/AchievementCelebrationHost';
import DayPlannerScreen from '../screens/profile/DayPlannerScreen';
import MyProductsScreen from '../screens/profile/MyProductsScreen';
import ManageSubscriptionScreen from '../screens/profile/ManageSubscriptionScreen';
import PersonalInfoScreen from '../screens/profile/PersonalInfoScreen';
import ProgressArchiveScreen from '../screens/profile/ProgressArchiveScreen';
import FaceScanArchiveScreen from '../screens/profile/FaceScanArchiveScreen';
import CourseListScreen from '../screens/courses/CourseListScreen';
import CourseDetailScreen from '../screens/courses/CourseDetailScreen';
import ChapterViewScreen from '../screens/courses/ChapterViewScreen';
import ScheduleScreen from '../screens/courses/ScheduleScreen';
import MaxxDetailScreen from '../screens/courses/MaxxDetailScreen';
import MaxDetailScreen from '../screens/marketplace/MaxDetailScreen';
import FitmaxPlanScreen from '../screens/courses/FitmaxPlanScreen';
import FitmaxWorkoutTrackerScreen from '../screens/courses/FitmaxWorkoutTrackerScreen';
import FitmaxCalorieLogScreen from '../screens/courses/FitmaxCalorieLogScreen';
import FitmaxProgressScreen from '../screens/courses/FitmaxProgressScreen';
import FitmaxModuleScreen from '../screens/courses/FitmaxModuleScreen';
import TabNavigator from './TabNavigator';
import LandingScreen from '../screens/onboarding/LandingScreen';
import LegalDocumentScreen from '../screens/legal/LegalDocumentScreen';
import AdminNavigator from './AdminNavigator';
import ScanOnlyNavigator from './ScanOnlyNavigator';
import { userHasSignupPhone } from '../utils/userPhone';
import OnboardingV2Screen from '../screens/onboarding/OnboardingV2Screen';
import RevealV2Screen from '../screens/onboarding/RevealV2Screen';
import WeeklyReviewScreen from '../screens/review/WeeklyReviewScreen';
import DaySetupScreen from '../screens/you/DaySetupScreen';
import { useFlag } from '../constants/featureFlags';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
    const { user, isLoading, isAuthenticated, isPaid, isScanUser } = useAuth();
    // Pivot flags: onboardingV2 = free-until-marketplace funnel (completed
    // unpaid users land on Main, not the legacy tier paywall); revealV2 swaps
    // the reveal behind its existing route name.
    const onboardingV2 = useFlag('onboardingV2');
    const revealV2 = useFlag('revealV2');
    // Face-scan kill switch: when off, the legacy pre-pay funnel skips
    // FeaturesIntro + FaceScan and sends a completed-but-unpaid user straight
    // to the paywall (Payment). Flip the flag on to restore the scan funnel.
    const faceScan = useFlag('faceScan');
    const OnboardingComponent = onboardingV2 ? OnboardingV2Screen : OnboardingScreen;
    const RevealComponent = revealV2 ? RevealV2Screen : RoutineRevealScreen;

    if (isLoading) {
        return <MaxLoadingView />;
    }

    const onboardingCompleted = user?.onboarding?.completed === true;
    const firstScanDone = user?.first_scan_completed === true;
    const postSubscriptionOnboarding = !!(user?.onboarding as Record<string, unknown> | undefined)?.post_subscription_onboarding;

    /**
     * Pre-pay:  Onboarding -> FeaturesIntro -> FaceScan -> FaceScanResults (locked) -> Payment.
     * Post-pay: Main (HomeScreen redirects to FaceScanResults postPay) -> ModuleSelect -> Main.
     *
     * SMS + notification screens (SmsCoachingIntro, SendblueConnect, SmsSetup,
     * NotificationChannels) stay registered in the paid stack and are reachable
     * from the post-scan flow. Push notifications default to ON for paid users;
     * they can still toggle device-level permissions via OS settings.
     */
    // Under onboardingV2 the paywall lives in the marketplace: a user who
    // finished onboarding gets the full app (Main/Today) whether or not they
    // ever pay. The legacy tier funnel stays intact when the flag is off.
    const treatAsFull = isPaid || (onboardingV2 && onboardingCompleted);

    const initialRoute = !isAuthenticated
        ? 'Landing'
        : isScanUser
            ? 'ScanOnly'
            : user?.is_admin
                ? 'Admin'
                : !treatAsFull
                    ? !onboardingCompleted
                        ? 'Onboarding'
                        : !faceScan
                            ? 'Payment'
                            : firstScanDone
                                ? 'FaceScanResults'
                                : 'FeaturesIntro'
                    : postSubscriptionOnboarding && isPaid
                        ? 'ModuleSelect'
                        : 'Main';

    const stackKey = !isAuthenticated
        ? 'guest'
        : isScanUser
            ? 'scan'
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
            ) : isScanUser ? (
                <Stack.Screen name="ScanOnly" component={ScanOnlyNavigator} />
            ) : user?.is_admin ? (
                <>
                    <Stack.Screen name="Admin" component={AdminNavigator} />
                </>
            ) : !treatAsFull ? (
                <>
                    <Stack.Screen name="Onboarding" component={OnboardingComponent} />
                    <Stack.Screen name="RoutineReveal" component={RevealComponent} />
                    <Stack.Screen name="FeaturesIntro" component={FeaturesIntroScreen} />
                    <Stack.Screen name="FaceScan" component={FaceScanScreen} />
                    <Stack.Screen name="FaceScanResults" component={FaceScanResultsScreen} />
                    <Stack.Screen name="ScanDetail" component={ScanDetailScreen} />
                    <Stack.Screen name="Payment" component={PaymentScreen} />
                    <Stack.Screen name="PaymentThankYou" component={PaymentThankYouScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="LegalDocument" component={LegalDocumentScreen} options={{ headerShown: false }} />
                </>
            ) : (
                <>
                    <Stack.Screen name="Main" component={TabNavigator} />
                    <Stack.Screen name="FaceScan" component={FaceScanScreen} />
                    <Stack.Screen name="FaceScanResults" component={FaceScanResultsScreen} />
                    {/* Locked scan results can show "Unlock full results" here too, so
                        Payment must be reachable from this stack — not just the funnel. */}
                    <Stack.Screen name="Payment" component={PaymentScreen} />
                    <Stack.Screen name="PaymentThankYou" component={PaymentThankYouScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="SmsCoachingIntro" component={SmsCoachingIntroScreen} />
                    <Stack.Screen name="SendblueConnect" component={SendblueConnectScreen} />
                    <Stack.Screen name="SmsSetup" component={SmsSetupScreen} />
                    <Stack.Screen name="NotificationChannels" component={NotificationChannelsScreen} />
                    <Stack.Screen name="ModuleSelect" component={ModuleSelectScreen} />
                    <Stack.Screen name="Profile" component={ProfileScreen} />
                    <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="EditPersonal" component={EditPersonalScreen} />
                    <Stack.Screen name="Personalization" component={PersonalizationScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="Achievements" component={AchievementsScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="DayPlanner" component={DayPlannerScreen} />
                    <Stack.Screen name="MyProducts" component={MyProductsScreen} />
                    <Stack.Screen name="ManageSubscription" component={ManageSubscriptionScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="PersonalInfo" component={PersonalInfoScreen} />
                    <Stack.Screen name="ProgressArchive" component={ProgressArchiveScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="FaceScanArchive" component={FaceScanArchiveScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="WeeklyReview" component={WeeklyReviewScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="DaySetup" component={DaySetupScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="RoutineReveal" component={RevealComponent} />

                    <Stack.Screen name="CourseList" component={CourseListScreen} />
                    <Stack.Screen name="CourseDetail" component={CourseDetailScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="ChapterView" component={ChapterViewScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="Schedule" component={ScheduleScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="MaxxDetail" component={MaxxDetailScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="MaxDetail" component={MaxDetailScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="FitmaxPlan" component={FitmaxPlanScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="FitmaxWorkoutTracker" component={FitmaxWorkoutTrackerScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="FitmaxCalorieLog" component={FitmaxCalorieLogScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="FitmaxProgress" component={FitmaxProgressScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="FitmaxModule" component={FitmaxModuleScreen} options={{ headerShown: false }} />
                    <Stack.Screen name="LegalDocument" component={LegalDocumentScreen} options={{ headerShown: false }} />
                </>
            )}
        </Stack.Navigator>
        {treatAsFull ? <AchievementCelebrationHost /> : null}
        </>
    );
}

export default RootNavigator;
