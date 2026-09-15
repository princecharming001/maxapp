import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, fonts } from '../../theme/dark';
import type { WalkthroughStep } from './useMainAppTour';

/**
 * First-run walkthrough card: a bottom ink card with ONE real action per step,
 * guiding a brand-new account from an empty Home to their own first Max.
 *
 *   build  "build your first max"  → Explore (they pick; Max tailors it)
 *   task   "start with this"       → their first task in TaskGuide
 *   chat   "max is your coach"     → the chat tab
 *
 * The step is CONTROLLED by useFirstRunWalkthrough (persisted per user), so a
 * tap on "build it", a trip through Explore, and a return to Home resume at the
 * right step instead of starting over — or never coming back.
 *
 * The scrim only hides the card for this visit; nothing here marks the
 * walkthrough done except the chat step's own actions.
 */

export type WalkthroughFirstTask = { title: string; time?: string | null } | null;

type Props = {
    visible: boolean;
    step: WalkthroughStep;
    /** Today's first pending task, when the user's plan has landed. */
    firstTask: WalkthroughFirstTask;
    /** 'build' primary: take them to Explore to start their first Max. */
    onBuildFirstMax: () => void;
    /** 'task' primary: open the first task in TaskGuide. */
    onOpenFirstTask: () => void;
    /** 'chat' primary: jump to the chat tab (also finishes). */
    onOpenChat: () => void;
    /** Move to another step while staying up ("skip"). */
    onGoTo: (to: WalkthroughStep) => void;
    /** Hide for this visit; same step returns next time. */
    onDismiss: () => void;
    /** Done for good. */
    onFinish: () => void;
};

const ORDER: WalkthroughStep[] = ['build', 'task', 'chat'];

type Card = { title: string; body: string; primary: string; secondary?: string };

export default function FirstRunWalkthrough({
    visible, step, firstTask, onBuildFirstMax, onOpenFirstTask, onOpenChat, onGoTo, onDismiss, onFinish,
}: Props) {
    const insets = useSafeAreaInsets();

    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!visible) return;
        anim.setValue(0);
        Animated.timing(anim, {
            toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
    }, [visible, step, anim]);

    if (!visible) return null;

    let card: Card;
    if (step === 'build') {
        card = {
            title: 'build your first max',
            body: 'pick what you want to work on. max builds the routine around your real hours.',
            primary: 'build it',
            secondary: 'later',
        };
    } else if (step === 'task') {
        const when = (firstTask?.time || '').trim();
        card = firstTask
            ? {
                title: 'start with this',
                body: `“${firstTask.title.toLowerCase()}”${when ? ` at ${when}` : ''}. open it and max walks you through.`,
                primary: 'open it',
                secondary: 'skip',
            }
            : {
                title: 'your max is live',
                body: 'it’s on your planner, built around your day. your first task shows up here when it’s time.',
                primary: 'got it',
            };
    } else {
        card = {
            title: 'max is your coach',
            body: 'ask max anything, or tell it to move any part of your day. it already knows your setup.',
            primary: 'open chat',
            secondary: 'i’m set',
        };
    }

    const handlePrimary = () => {
        if (step === 'build') { onBuildFirstMax(); return; }
        if (step === 'task') {
            if (firstTask) { onOpenFirstTask(); return; }
            onGoTo('chat');
            return;
        }
        onOpenChat();
    };

    const handleSecondary = () => {
        if (step === 'build') { onDismiss(); return; }
        if (step === 'task') { onGoTo('chat'); return; }
        onFinish();
    };

    const idx = Math.max(0, ORDER.indexOf(step));

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
            {/* Scrim — tapping it hides the card for now; it comes back next visit. */}
            <Pressable style={s.scrim} onPress={onDismiss} accessibilityLabel="Dismiss walkthrough" />
            <Animated.View
                style={[
                    s.card,
                    { paddingBottom: 20 + insets.bottom },
                    {
                        opacity: anim,
                        transform: [{
                            translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [36, 0] }),
                        }],
                    },
                ]}
                testID="first-run-walkthrough"
            >
                <Text style={s.kicker}>getting started</Text>
                <Text style={s.title}>{card.title}</Text>
                <Text style={s.body}>{card.body}</Text>

                <View style={s.row}>
                    <View style={s.dots}>
                        {ORDER.map((st, i) => (
                            <View key={st} style={[s.dot, i === idx && s.dotActive]} />
                        ))}
                    </View>
                    <View style={s.actions}>
                        {card.secondary ? (
                            <TouchableOpacity onPress={handleSecondary} hitSlop={10} accessibilityRole="button">
                                <Text style={s.secondary}>{card.secondary}</Text>
                            </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                            style={s.primaryBtn}
                            onPress={handlePrimary}
                            accessibilityRole="button"
                            testID="walkthrough-primary"
                        >
                            <Text style={s.primaryText}>{card.primary}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Animated.View>
        </View>
    );
}

const s = StyleSheet.create({
    scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
    card: {
        position: 'absolute', left: 12, right: 12, bottom: 12,
        backgroundColor: colors.foreground,
        borderRadius: borderRadius.lg + 4,
        borderCurve: 'continuous',
        paddingHorizontal: 22, paddingTop: 22,
        shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 12 },
        elevation: 10,
    },
    kicker: {
        fontFamily: fonts.sansMedium, fontSize: 11, letterSpacing: 1.6,
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 8,
    },
    title: { fontFamily: fonts.serif, fontSize: 26, color: colors.buttonText, letterSpacing: -0.4 },
    body: {
        fontFamily: fonts.sans, fontSize: 14.5, lineHeight: 21,
        color: 'rgba(255,255,255,0.72)', marginTop: 8, marginBottom: 20,
    },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dots: { flexDirection: 'row', gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
    dotActive: { backgroundColor: colors.buttonText },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
    secondary: { fontFamily: fonts.sansMedium, fontSize: 13.5, color: 'rgba(255,255,255,0.55)' },
    primaryBtn: {
        backgroundColor: colors.buttonText, borderRadius: borderRadius.full,
        paddingHorizontal: 20, paddingVertical: 11,
    },
    primaryText: { fontFamily: fonts.sansMedium, fontSize: 14.5, color: colors.foreground },
});
