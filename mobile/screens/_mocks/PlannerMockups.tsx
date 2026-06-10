/**
 * PlannerMockups - DEV-ONLY design mockups for the "Today Loop" planner redesign.
 * Not wired into navigation. Rendered via a dev flag in App.tsx for screenshot review.
 * Throwaway/prototype: real screens will reuse these patterns + the glass primitives.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackdrop } from '../../components/glass/ScreenBackdrop';
import { GlassCard } from '../../components/glass/GlassCard';
import { GlassButton } from '../../components/glass/GlassButton';

const { height: WIN_H } = Dimensions.get('window');
const H = Platform.OS === 'web' ? 812 : WIN_H;
const INK = '#111113';
const GOLD = '#D4A017';
const MUTE = '#8A8A92';
const SUB = '#3A3A3F';

// ---------- shared bits ----------
function Screen({ children, pad = 22 }: { children: React.ReactNode; pad?: number }) {
    return (
        <View style={{ height: H, width: '100%' }}>
            <ScreenBackdrop>
                <View style={{ flex: 1, paddingHorizontal: pad, paddingTop: 64, paddingBottom: 20 }}>{children}</View>
            </ScreenBackdrop>
        </View>
    );
}
function Label({ children }: { children: React.ReactNode }) {
    return <Text style={styles.label}>{children}</Text>;
}
function Chip({ icon, text, tone = 'glass' }: { icon?: any; text: string; tone?: 'glass' | 'gold' | 'ink' }) {
    const bg = tone === 'gold' ? 'rgba(212,160,23,0.16)' : tone === 'ink' ? 'rgba(17,17,19,0.9)' : 'rgba(255,255,255,0.6)';
    const fg = tone === 'ink' ? '#fff' : tone === 'gold' ? '#8a6a10' : SUB;
    return (
        <View style={[styles.chip, { backgroundColor: bg, borderColor: tone === 'glass' ? 'rgba(255,255,255,0.6)' : 'transparent' }]}>
            {icon ? <Ionicons name={icon} size={12} color={fg} style={{ marginRight: 4 }} /> : null}
            <Text style={[styles.chipText, { color: fg }]}>{text}</Text>
        </View>
    );
}
function Ring({ value, size = 44, done = false }: { value: string; size?: number; done?: boolean }) {
    return (
        <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: done ? GOLD : 'rgba(17,17,19,0.15)' }]}>
            <Text style={[styles.ringText, done && { color: GOLD }]}>{value}</Text>
        </View>
    );
}
// a quiet structure row (wake/work/gym/sleep) or a program task row
function TimeRow({ time, title, why, kind, locked, done }: { time: string; title: string; why?: string; kind: 'struct' | 'task'; locked?: boolean; done?: boolean }) {
    return (
        <View style={styles.trow}>
            <Text style={styles.trTime}>{time}</Text>
            <View style={[styles.trDot, { backgroundColor: kind === 'task' ? GOLD : 'rgba(17,17,19,0.2)' }]} />
            <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[styles.trTitle, kind === 'struct' && { color: MUTE, fontFamily: 'Matter-Medium' }, done && { color: MUTE, textDecorationLine: 'line-through' }]}>{title}</Text>
                    {locked ? <Ionicons name="lock-closed" size={12} color={MUTE} style={{ marginLeft: 6 }} /> : null}
                    {done ? <Ionicons name="checkmark-circle" size={15} color={GOLD} style={{ marginLeft: 6 }} /> : null}
                </View>
                {why ? <Text style={styles.trWhy}>{why}</Text> : null}
            </View>
        </View>
    );
}

// ============================================================
// 1. TODAY (home) - the centerpiece
// ============================================================
function TodayScreen() {
    return (
        <View style={{ height: H, width: '100%' }}>
            <ScreenBackdrop>
                <View style={{ flex: 1, paddingTop: 60 }}>
                    <View style={{ paddingHorizontal: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View>
                            <Text style={styles.todayKicker}>TUESDAY, JUN 9</Text>
                            <Text style={styles.todayTitle}>Today</Text>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                            <Ring value="12" done />
                            <Text style={styles.streakCap}>day streak</Text>
                        </View>
                    </View>

                    <ScrollView style={{ flex: 1, marginTop: 14 }} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
                        {/* lock-in banner */}
                        <View style={styles.bannerWrap}>
                            <BlurView intensity={26} tint="light" style={StyleSheet.absoluteFill} />
                            <View style={styles.bannerInner}>
                                <Text style={styles.bannerTitle}>Lock in today</Text>
                                <Text style={styles.bannerSub}>Looks right. I moved one thing around your dinner.</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 }}>
                                    <Chip icon="swap-horizontal" text="PM skin moved to 9:40, dinner at 7" tone="glass" />
                                </View>
                                <View style={{ marginTop: 12 }}>
                                    <GlassButton variant="primary" label="Confirm day" onPress={() => {}} />
                                </View>
                            </View>
                        </View>

                        {/* now / next hero */}
                        <Text style={[styles.label, { marginTop: 18, marginBottom: 8 }]}>NEXT UP</Text>
                        <GlassCard radius={26} intensity={44}>
                            <View style={{ padding: 20 }}>
                                <Text style={styles.heroTime}>7:10a  ·  right after you're up</Text>
                                <Text style={styles.heroTitle}>Wash your face</Text>
                                <Text style={styles.heroDesc}>Gentle cleanser, lukewarm water. 2 minutes.</Text>
                                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'center' }}>
                                    <View style={{ flex: 1 }}>
                                        <GlassButton variant="primary" label="Done" onPress={() => {}} />
                                    </View>
                                    <GlassButton variant="glass" label="Snooze" onPress={() => {}} style={{ width: 110 }} />
                                </View>
                            </View>
                        </GlassCard>

                        {/* anchored timeline */}
                        <Text style={[styles.label, { marginTop: 20, marginBottom: 6 }]}>YOUR DAY</Text>
                        <GlassCard radius={24} intensity={36}>
                            <View style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
                                <TimeRow time="7:00a" title="Wake" kind="struct" />
                                <TimeRow time="7:10a" title="Wash your face" why="right after you're up" kind="task" done />
                                <TimeRow time="9:00a" title="Work" kind="struct" />
                                <TimeRow time="1:00p" title="Protein + water" why="on your lunch break" kind="task" />
                                <TimeRow time="6:00p" title="Gym" kind="struct" />
                                <TimeRow time="6:50p" title="Posture + stretch" why="right after you train" kind="task" locked />
                                <TimeRow time="9:40p" title="PM skincare" why="wind-down before bed" kind="task" />
                                <TimeRow time="11:00p" title="Sleep" kind="struct" />
                            </View>
                        </GlassCard>
                        <Text style={styles.weeklink}>See the full week</Text>
                    </ScrollView>

                    {/* bottom nav: Today / Coach / Progress */}
                    <View style={styles.navWrap}>
                        <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
                        <View style={styles.navInner}>
                            <NavItem icon="today" label="Today" active />
                            <NavItem icon="chatbubble-ellipses-outline" label="Coach" />
                            <NavItem icon="trending-up-outline" label="Progress" />
                        </View>
                    </View>
                </View>
            </ScreenBackdrop>
        </View>
    );
}
function NavItem({ icon, label, active }: { icon: any; label: string; active?: boolean }) {
    return (
        <View style={{ alignItems: 'center', gap: 3 }}>
            <View style={[active && styles.navActive]}>
                <Ionicons name={icon} size={active ? 24 : 22} color={active ? INK : MUTE} />
            </View>
            <Text style={[styles.navLabel, { color: active ? INK : MUTE }]}>{label}</Text>
        </View>
    );
}

// ============================================================
// 2. FIRST-RUN REVEAL
// ============================================================
function RevealScreen() {
    return (
        <Screen>
            <Text style={styles.revealKicker}>YOUR FIRST DAY, BUILT</Text>
            <Text style={styles.revealTitle}>Here's your{'\n'}next 12 hours</Text>
            <Text style={styles.revealSub}>I slotted 3 things into the gaps around your real day. Nothing in your way.</Text>
            <GlassCard radius={26} intensity={40} style={{ marginTop: 22 }}>
                <View style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                    <TimeRow time="7:00a" title="Wake" kind="struct" />
                    <TimeRow time="7:10a" title="Cleanse + moisturize" why="right after you're up" kind="task" />
                    <TimeRow time="9:00a" title="Work" kind="struct" />
                    <TimeRow time="1:00p" title="Protein + water" why="on your lunch" kind="task" />
                    <TimeRow time="6:00p" title="Gym" kind="struct" />
                    <TimeRow time="9:40p" title="PM skincare + mewing" why="wind-down before bed" kind="task" />
                    <TimeRow time="11:00p" title="Sleep" kind="struct" />
                </View>
            </GlassCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
                <View style={{ flex: 1 }}>
                    <GlassButton variant="primary" label="Looks right" onPress={() => {}} />
                </View>
                <GlassButton variant="glass" label="Tweak it" onPress={() => {}} style={{ width: 120 }} />
            </View>
        </Screen>
    );
}

// ============================================================
// 3. SMART NUDGE (in-app sheet + push/SMS copy)
// ============================================================
function NudgeScreen() {
    return (
        <Screen>
            <Text style={styles.h1}>Smart nudges</Text>
            <Text style={styles.pSub}>Fired when you can actually act, not on a clock. One line, anchored to where you are.</Text>

            <Label>HOW IT ARRIVES</Label>
            <GlassCard radius={20} intensity={30} style={{ marginTop: 8 }}>
                <View style={{ padding: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Ionicons name="notifications" size={14} color={MUTE} />
                        <Text style={styles.copyKind}>  PUSH</Text>
                    </View>
                    <Text style={styles.copyLine}>You just got home. 2-min PM skin before you settle in.</Text>
                </View>
            </GlassCard>
            <GlassCard radius={20} intensity={30} style={{ marginTop: 10 }}>
                <View style={{ padding: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                        <Ionicons name="chatbubble" size={14} color={MUTE} />
                        <Text style={styles.copyKind}>  SMS (Max coach)</Text>
                    </View>
                    <Text style={styles.copyLine}>near the gym? good time to hit today's lift. takes 35. you in?</Text>
                </View>
            </GlassCard>

            <Label>IN APP</Label>
            <View style={{ marginTop: 8 }}>
                <GlassCard radius={26} intensity={46}>
                    <View style={{ padding: 20 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <Ionicons name="home" size={15} color={GOLD} />
                            <Text style={[styles.copyKind, { color: GOLD }]}>  YOU'RE HOME</Text>
                        </View>
                        <Text style={styles.heroTitle}>PM skincare</Text>
                        <Text style={styles.heroDesc}>Before you settle in. 2 minutes, then you're done for the day.</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                            <View style={{ flex: 1 }}><GlassButton variant="primary" label="Do it now" onPress={() => {}} /></View>
                            <GlassButton variant="glass" label="Not now" onPress={() => {}} style={{ width: 120 }} />
                        </View>
                    </View>
                </GlassCard>
                <Text style={styles.fineNote}>Not now reschedules into your next open window. No guilt, no streak hit.</Text>
            </View>
        </Screen>
    );
}

// ============================================================
// 4. WEEKLY REVIEW / LEARNED-SCHEDULE CONFIRM
// ============================================================
function WeeklyScreen() {
    return (
        <Screen>
            <Text style={styles.revealKicker}>THIS WEEK WITH MAX</Text>
            <Text style={styles.h1}>You showed up</Text>
            <GlassCard radius={24} intensity={40} style={{ marginTop: 12 }}>
                <View style={{ padding: 18 }}>
                    <Text style={styles.weekBig}>5 of 7 evenings</Text>
                    <Text style={styles.heroDesc}>Strongest right after dinner. That's your slot.</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <Ring key={i} value={d} size={32} done={i !== 1 && i !== 5} />)}
                    </View>
                </View>
            </GlassCard>

            <Label>WHAT I LEARNED ABOUT YOU</Label>
            <View style={{ gap: 10, marginTop: 8 }}>
                <LearnedFact text="Your real wake is 7:25, not 7:00." />
                <LearnedFact text="You skip the morning lift. Move it to evenings?" />
                <LearnedFact text="You're near a gym Tue and Thu at 6pm." />
            </View>
            <Text style={styles.fineNote}>I never change your plan without asking. Confirm what's right.</Text>
        </Screen>
    );
}
function LearnedFact({ text }: { text: string }) {
    return (
        <GlassCard radius={18} intensity={32}>
            <View style={{ padding: 14 }}>
                <Text style={styles.factText}>{text}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <View style={{ flex: 1 }}><GlassButton variant="primary" label="Yep" onPress={() => {}} /></View>
                    <GlassButton variant="glass" label="Not quite" onPress={() => {}} style={{ width: 130 }} />
                </View>
            </View>
        </GlassCard>
    );
}

// ============================================================
// 5. PLACES SETUP
// ============================================================
function PlacesScreen() {
    return (
        <Screen>
            <Text style={styles.h1}>Your places</Text>
            <Text style={styles.pSub}>So Max can time things to where you are, and remind you at the gym or before you leave.</Text>
            <View style={{ gap: 10, marginTop: 14 }}>
                <PlaceRow icon="home" label="Home" sub="1100 Bay St" set radius="150m" />
                <PlaceRow icon="briefcase" label="Work" sub="Market St, weekdays 9 to 5" set radius="150m" />
                <PlaceRow icon="barbell" label="Gym" sub="Tap to add" />
                <PlaceRow icon="cart" label="Grocery" sub="Tap to add" />
            </View>
            <GlassCard radius={18} intensity={28} style={{ marginTop: 14 }}>
                <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="sparkles" size={16} color={GOLD} />
                    <Text style={[styles.factText, { flex: 1, marginLeft: 10 }]}>Max can learn these on its own and ask you to confirm. Nothing leaves your phone.</Text>
                </View>
            </GlassCard>
            <View style={{ marginTop: 'auto' }}>
                <GlassButton variant="primary" label="Add a place" onPress={() => {}} />
            </View>
        </Screen>
    );
}
function PlaceRow({ icon, label, sub, set, radius }: { icon: any; label: string; sub: string; set?: boolean; radius?: string }) {
    return (
        <GlassCard radius={18} intensity={32}>
            <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center' }}>
                <View style={styles.placeIcon}><Ionicons name={icon} size={18} color={INK} /></View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.placeLabel}>{label}</Text>
                    <Text style={styles.placeSub}>{sub}</Text>
                </View>
                {set ? <Chip text={radius || ''} tone="glass" /> : <Ionicons name="add-circle-outline" size={22} color={MUTE} />}
            </View>
        </GlassCard>
    );
}

// ============================================================
// 6. CALENDAR CONNECT
// ============================================================
function CalendarScreen() {
    return (
        <Screen>
            <Text style={styles.h1}>Connect your calendar</Text>
            <Text style={styles.pSub}>So Max stops scheduling over your real life and works around your meetings.</Text>
            <View style={{ gap: 12, marginTop: 16 }}>
                <GlassCard radius={22} intensity={42}>
                    <View style={{ padding: 18 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons name="logo-apple" size={20} color={INK} />
                                <Text style={styles.calTitle}>  Apple Calendar</Text>
                            </View>
                            <Chip text="STAYS ON DEVICE" tone="gold" />
                        </View>
                        <Text style={styles.heroDesc}>Read-only, on your phone. Your events never reach our servers.</Text>
                        <View style={{ marginTop: 12 }}><GlassButton variant="primary" label="Connect Apple Calendar" onPress={() => {}} /></View>
                    </View>
                </GlassCard>
                <GlassCard radius={22} intensity={34}>
                    <View style={{ padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="logo-google" size={18} color={INK} />
                            <Text style={styles.calTitle}>  Google Calendar</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={MUTE} />
                    </View>
                </GlassCard>
            </View>

            <Label>WHAT MAX SEES</Label>
            <GlassCard radius={20} intensity={30} style={{ marginTop: 8 }}>
                <View style={{ padding: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={styles.calEv}>Standup</Text><Text style={styles.placeSub}>9:30a</Text></View>
                    <View style={{ height: 1, backgroundColor: 'rgba(17,17,19,0.08)', marginVertical: 8 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={styles.calEv}>Dentist</Text><Text style={styles.placeSub}>2:00p</Text></View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                        <Chip icon="swap-horizontal" text="Max moved your PM skincare to 9:40" tone="glass" />
                    </View>
                </View>
            </GlassCard>
        </Screen>
    );
}

// ============================================================
// 7. ADAPTIVE RESCHEDULE
// ============================================================
function RescheduleScreen() {
    return (
        <Screen>
            <View style={{ flex: 1, justifyContent: 'center' }}>
                <Text style={styles.revealKicker}>NO STRESS</Text>
                <Text style={styles.h1}>Missed your lunch protein</Text>
                <Text style={styles.pSub}>Happens. Here's the fix, you don't lose the day.</Text>
                <GlassCard radius={24} intensity={42} style={{ marginTop: 18 }}>
                    <View style={{ padding: 18 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.reschedOld}>1:00p</Text>
                            <Ionicons name="arrow-forward" size={16} color={MUTE} style={{ marginHorizontal: 10 }} />
                            <Text style={styles.reschedNew}>3:30p</Text>
                            <Text style={[styles.heroDesc, { marginLeft: 10, marginBottom: 0 }]}>after your meeting</Text>
                        </View>
                        <View style={{ height: 1, backgroundColor: 'rgba(17,17,19,0.08)', marginVertical: 14 }} />
                        <Text style={styles.factText}>Tomorrow stays exactly the same. Your streak is safe.</Text>
                    </View>
                </GlassCard>
                <View style={{ gap: 8, marginTop: 18 }}>
                    <GlassButton variant="primary" label="Do it at 3:30" onPress={() => {}} />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 1 }}><GlassButton variant="glass" label="Pick a time" onPress={() => {}} /></View>
                        <View style={{ flex: 1 }}><GlassButton variant="glass" label="Skip today" onPress={() => {}} /></View>
                    </View>
                </View>
            </View>
        </Screen>
    );
}

// ---------- gallery ----------
export default function PlannerMockups() {
    return (
        <ScrollView style={{ flex: 1, backgroundColor: '#F7F8FC' }} showsVerticalScrollIndicator={false}>
            <TodayScreen />
            <RevealScreen />
            <NudgeScreen />
            <WeeklyScreen />
            <PlacesScreen />
            <CalendarScreen />
            <RescheduleScreen />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    label: { fontFamily: 'Matter-SemiBold', fontSize: 10.5, letterSpacing: 1.4, color: MUTE, marginTop: 16 },
    h1: { fontFamily: 'PlayfairDisplay', fontSize: 32, color: INK, letterSpacing: -0.5 },
    pSub: { fontFamily: 'Matter-Regular', fontSize: 14.5, color: MUTE, lineHeight: 21, marginTop: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
    chipText: { fontFamily: 'Matter-Medium', fontSize: 11.5, letterSpacing: 0.2 },
    ring: { borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
    ringText: { fontFamily: 'Matter-Bold', fontSize: 13, color: INK },
    // today
    todayKicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.4, color: MUTE },
    todayTitle: { fontFamily: 'PlayfairDisplay', fontSize: 40, color: INK, letterSpacing: -1, marginTop: 2 },
    streakCap: { fontFamily: 'Matter-Medium', fontSize: 10, color: MUTE, marginTop: 3 },
    bannerWrap: { borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', marginTop: 4 },
    bannerInner: { padding: 18, backgroundColor: 'rgba(255,255,255,0.5)' },
    bannerTitle: { fontFamily: 'PlayfairDisplay', fontSize: 22, color: INK },
    bannerSub: { fontFamily: 'Matter-Regular', fontSize: 13.5, color: SUB, marginTop: 4, lineHeight: 20 },
    heroTime: { fontFamily: 'Matter-Medium', fontSize: 12.5, color: GOLD, letterSpacing: 0.3 },
    heroTitle: { fontFamily: 'PlayfairDisplay', fontSize: 28, color: INK, marginTop: 4, letterSpacing: -0.4 },
    heroDesc: { fontFamily: 'Matter-Regular', fontSize: 14, color: MUTE, marginTop: 6, lineHeight: 21 },
    weeklink: { fontFamily: 'Matter-Medium', fontSize: 13, color: MUTE, textDecorationLine: 'underline', textAlign: 'center', marginTop: 16 },
    // timeline rows
    trow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9 },
    trTime: { fontFamily: 'Matter-Medium', fontSize: 12, color: MUTE, width: 48, paddingTop: 1 },
    trDot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 5, marginRight: 12 },
    trTitle: { fontFamily: 'Matter-SemiBold', fontSize: 15, color: INK },
    trWhy: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 1 },
    // nav
    navWrap: { marginHorizontal: 40, marginBottom: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
    navInner: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.55)' },
    navActive: { },
    navLabel: { fontFamily: 'Matter-Medium', fontSize: 10.5 },
    // reveal
    revealKicker: { fontFamily: 'Matter-SemiBold', fontSize: 11, letterSpacing: 1.6, color: GOLD },
    revealTitle: { fontFamily: 'PlayfairDisplay', fontSize: 38, color: INK, letterSpacing: -1, marginTop: 8, lineHeight: 42 },
    revealSub: { fontFamily: 'Matter-Regular', fontSize: 15, color: MUTE, marginTop: 10, lineHeight: 22 },
    // nudge / generic
    copyKind: { fontFamily: 'Matter-SemiBold', fontSize: 10.5, letterSpacing: 1, color: MUTE },
    copyLine: { fontFamily: 'Matter-Regular', fontSize: 15, color: INK, lineHeight: 22 },
    fineNote: { fontFamily: 'Matter-Regular', fontSize: 12.5, color: MUTE, marginTop: 12, lineHeight: 18 },
    // weekly
    weekBig: { fontFamily: 'PlayfairDisplay', fontSize: 26, color: INK },
    factText: { fontFamily: 'Matter-Medium', fontSize: 15, color: INK, lineHeight: 21 },
    // places
    placeIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center', marginRight: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' },
    placeLabel: { fontFamily: 'Matter-SemiBold', fontSize: 15.5, color: INK },
    placeSub: { fontFamily: 'Matter-Regular', fontSize: 13, color: MUTE, marginTop: 1 },
    // calendar
    calTitle: { fontFamily: 'Matter-SemiBold', fontSize: 16, color: INK },
    calEv: { fontFamily: 'Matter-Medium', fontSize: 14.5, color: INK },
    // reschedule
    reschedOld: { fontFamily: 'Matter-Medium', fontSize: 18, color: MUTE, textDecorationLine: 'line-through' },
    reschedNew: { fontFamily: 'Matter-Bold', fontSize: 22, color: INK },
});
