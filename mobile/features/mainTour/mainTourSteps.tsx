import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { TourStep, RenderProps } from 'react-native-spotlight-tour';
import { colors, fonts, borderRadius } from '../../theme/dark';

/* ─── Step indices (shared between AttachStep wrappers and the steps array) ─── */

// IMPORTANT: every index here MUST have a matching <AttachStep index=…> mounted
// somewhere in the tree that is on-screen when the tour reaches it, and the
// TOUR_STEPS array below must have exactly one entry per index (contiguous from
// 0). A step with no anchor wedges react-native-spotlight-tour into a full-screen
// backdrop that silently swallows every touch — the "can't press anything" bug.
// Anchors today: PROGRESS+PROGRAMS in HomeScreen, the three *_TAB on the tab icons.
export const TOUR_STEP = {
    PROGRESS: 0,
    PROGRAMS: 1,
    SCHEDULE_TAB: 2,
    EXPLORE_TAB: 3,
    CHAT_TAB: 4,
} as const;

const TOTAL_STEPS = Object.keys(TOUR_STEP).length;

/* ─── Tooltip component used by every step ─── */

function Tooltip({
    title,
    body,
    current,
    isLast,
    next,
    stop,
}: {
    title: string;
    body: string;
    current: number;
    isLast: boolean;
    next: () => void;
    stop: () => void;
}) {
    return (
        <View style={tt.card}>
            <Text style={tt.title}>{title}</Text>
            <Text style={tt.body}>{body}</Text>
            <View style={tt.footer}>
                {!isLast && (
                    <TouchableOpacity onPress={stop} hitSlop={8} activeOpacity={0.6}>
                        <Text style={tt.skip}>Skip</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={tt.nextBtn} onPress={isLast ? stop : next} activeOpacity={0.75}>
                    <Text style={tt.nextText}>{isLast ? 'Done' : 'Next'}</Text>
                </TouchableOpacity>
            </View>
            <View style={tt.dots}>
                {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                    <View key={i} style={[tt.dot, i === current && tt.dotActive]} />
                ))}
            </View>
        </View>
    );
}

const tt = StyleSheet.create({
    card: {
        backgroundColor: colors.foreground,
        borderRadius: borderRadius.lg,
        paddingVertical: 18,
        paddingHorizontal: 20,
        maxWidth: 280,
    },
    title: {
        fontFamily: fonts.serif,
        fontSize: 17,
        color: colors.buttonText,
        marginBottom: 6,
        letterSpacing: -0.2,
    },
    body: {
        fontFamily: fonts.sans,
        fontSize: 13,
        color: 'rgba(255,255,255,0.72)',
        lineHeight: 19,
        marginBottom: 16,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 16,
    },
    skip: {
        fontFamily: fonts.sansMedium,
        fontSize: 13,
        color: 'rgba(255,255,255,0.5)',
    },
    nextBtn: {
        backgroundColor: colors.buttonText,
        borderRadius: borderRadius.full,
        paddingHorizontal: 18,
        paddingVertical: 8,
    },
    nextText: {
        fontFamily: fonts.sansMedium,
        fontSize: 13,
        color: colors.foreground,
        letterSpacing: 0.2,
    },
    dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 5,
        marginTop: 14,
    },
    dot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: 'rgba(255,255,255,0.25)',
    },
    dotActive: {
        backgroundColor: colors.buttonText,
    },
});

/* ─── Step definitions ─── */

const STEP_CONTENT: { title: string; body: string }[] = [
    {
        title: 'Your progress',
        body: 'Tasks done and your streak, at a glance. Tap to open your schedule.',
    },
    {
        title: 'Your programs',
        body: "The maxxes you're on live here. Tap one to open it, or + to add more.",
    },
    {
        title: 'Schedule',
        body: 'Your full day — tasks, reminders, and streaks. Plan when things land.',
    },
    {
        title: 'Explore',
        body: 'Browse maxes and creator courses. Max fits anything you start to your schedule.',
    },
    {
        title: 'Chat with Max',
        body: 'Ask anything — coaching, schedule help, or program questions.',
    },
];

export const TOUR_STEPS: TourStep[] = STEP_CONTENT.map((content, idx) => ({
    render: ({ current, isLast, next, stop }: RenderProps) => (
        <Tooltip
            title={content.title}
            body={content.body}
            current={current}
            isLast={isLast}
            next={next}
            stop={stop}
        />
    ),
    shape: 'rectangle' as const,
    placement: idx <= 1 ? ('bottom' as const) : ('top' as const),
}));
