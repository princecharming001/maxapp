import WidgetKit
import SwiftUI

// MARK: - Shared data (written by the RN app into the App Group)

private let appGroup = "group.com.cannon.mobile"
private let snapshotKey = "todaySnapshot"

struct TaskItem: Codable, Hashable {
    var title: String
    var time: String      // pre-formatted, e.g. "4:30p"
    var color: String     // hex, e.g. "#8B5CF6"
    var done: Bool
}

struct TodaySnapshot: Codable {
    var streak: Int
    var done: Int
    var total: Int
    var tasks: [TaskItem]
    var updatedAt: String?

    var progress: Double {
        total > 0 ? Double(done) / Double(total) : 0
    }

    static let placeholder = TodaySnapshot(
        streak: 47,
        done: 3,
        total: 6,
        tasks: [
            TaskItem(title: "Mewing hold", time: "4:30p", color: "#8B5CF6", done: false),
            TaskItem(title: "Jaw + posture set", time: "6:00p", color: "#F59E0B", done: false),
            TaskItem(title: "Evening lift", time: "7:15p", color: "#10B981", done: false),
            TaskItem(title: "Skincare AM", time: "", color: "#9A9A9A", done: true),
        ],
        updatedAt: nil
    )

    static func load() -> TodaySnapshot {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = defaults.string(forKey: snapshotKey),
            let data = raw.data(using: .utf8),
            let decoded = try? JSONDecoder().decode(TodaySnapshot.self, from: data)
        else {
            return .placeholder
        }
        return decoded
    }
}

// MARK: - Timeline

struct MaxEntry: TimelineEntry {
    let date: Date
    let snapshot: TodaySnapshot
}

struct MaxProvider: TimelineProvider {
    func placeholder(in context: Context) -> MaxEntry {
        MaxEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (MaxEntry) -> Void) {
        completion(MaxEntry(date: Date(), snapshot: TodaySnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MaxEntry>) -> Void) {
        let entry = MaxEntry(date: Date(), snapshot: TodaySnapshot.load())
        // The app reloads timelines on every data change; this is just a
        // safety refresh so the list doesn't go stale if the app never opens.
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Colors

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        let r, g, b: Double
        if s.count == 6 {
            r = Double((v & 0xFF0000) >> 16) / 255
            g = Double((v & 0x00FF00) >> 8) / 255
            b = Double(v & 0x0000FF) / 255
        } else {
            r = 0.6; g = 0.6; b = 0.6
        }
        self = Color(red: r, green: g, blue: b)
    }
}

private let flame = Color(hex: "#F59E0B")
private let flameHot = Color(hex: "#FF7A00")
private let ember = Color(hex: "#FFD778")

// MARK: - Backgrounds

/// Barely-warm paper gradient for the light Today list.
private var paperGradient: LinearGradient {
    LinearGradient(
        colors: [Color(hex: "#FFFFFF"), Color(hex: "#F7F4EF")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
}

/// Deep ink gradient for the streak tile.
private var inkGradient: LinearGradient {
    LinearGradient(
        colors: [Color(hex: "#23201B"), Color(hex: "#0E0D0B")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
}

extension View {
    @ViewBuilder
    func widgetSurface<S: ShapeStyle>(_ style: S) -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) { Rectangle().fill(style) }
        } else {
            self.background(Rectangle().fill(style))
        }
    }
}

// MARK: - Pieces

/// Amber-tinted capsule chip carrying the streak.
struct StreakChip: View {
    let streak: Int
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(
                    LinearGradient(colors: [ember, flameHot], startPoint: .top, endPoint: .bottom)
                )
            Text("\(streak)")
                .font(.system(size: 15, weight: .semibold, design: .serif))
                .foregroundColor(Color(hex: "#8A5A00"))
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(Capsule().fill(flame.opacity(0.14)))
    }
}

/// Multi-stop gradient progress bar built from the day's max colors.
struct DayProgressBar: View {
    let snapshot: TodaySnapshot
    var stops: [Color] {
        let cs = snapshot.tasks.map { Color(hex: $0.color) }
        return cs.count >= 2 ? cs : [Color(hex: "#111113"), Color(hex: "#55524C")]
    }
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.07))
                Capsule()
                    .fill(LinearGradient(colors: stops, startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(6, geo.size.width * snapshot.progress))
            }
        }
        .frame(height: 4)
    }
}

struct TaskRow: View {
    let task: TaskItem
    var tint: Color { Color(hex: task.color) }
    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                if task.done {
                    Circle().fill(tint.opacity(0.18))
                    Image(systemName: "checkmark")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(tint)
                } else {
                    Circle().strokeBorder(tint, lineWidth: 1.8)
                    Circle().fill(tint.opacity(0.12)).padding(3.5)
                }
            }
            .frame(width: 17, height: 17)
            Text(task.title)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(task.done ? Color(uiColor: .tertiaryLabel) : .primary)
                .strikethrough(task.done, color: Color(uiColor: .tertiaryLabel))
                .lineLimit(1)
            Spacer(minLength: 4)
            if task.done {
                Text("done")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Color(uiColor: .tertiaryLabel))
            } else if !task.time.isEmpty {
                Text(task.time)
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundColor(tint)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2.5)
                    .background(Capsule().fill(tint.opacity(0.12)))
            }
        }
    }
}

// MARK: - Today list (small + medium)

struct TodayListView: View {
    @Environment(\.widgetFamily) var family
    let snapshot: TodaySnapshot

    var visibleTasks: [TaskItem] {
        Array(snapshot.tasks.prefix(family == .systemMedium ? 4 : 2))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemMedium ? 7 : 6) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Today")
                        .font(.system(size: family == .systemMedium ? 19 : 15, weight: .semibold, design: .serif))
                        .foregroundColor(.primary)
                    Text("\(snapshot.done) of \(snapshot.total) done")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                Spacer()
                if family == .systemMedium {
                    StreakChip(streak: snapshot.streak)
                }
            }
            DayProgressBar(snapshot: snapshot)
                .padding(.bottom, 2)
            ForEach(visibleTasks, id: \.self) { TaskRow(task: $0) }
            Spacer(minLength: 0)
            if family == .systemSmall {
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(
                            LinearGradient(colors: [ember, flameHot], startPoint: .top, endPoint: .bottom)
                        )
                    Text("\(snapshot.streak) day streak")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(family == .systemMedium ? 15 : 13)
        .widgetURL(URL(string: "cannon://today"))
        .widgetSurface(paperGradient)
    }
}

// MARK: - Streak (small ink tile + lock screen)

struct StreakRingView: View {
    let snapshot: TodaySnapshot

    var body: some View {
        ZStack {
            // Track
            Circle()
                .stroke(Color.white.opacity(0.10), lineWidth: 6)
            // Progress arc with a hot amber sweep + soft glow
            Circle()
                .trim(from: 0, to: max(0.02, snapshot.progress))
                .stroke(
                    AngularGradient(
                        colors: [flame, ember, flameHot, flame],
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: 6, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .shadow(color: flameHot.opacity(0.55), radius: 5)
            VStack(spacing: 0) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(
                        LinearGradient(colors: [ember, flameHot], startPoint: .top, endPoint: .bottom)
                    )
                    .shadow(color: flameHot.opacity(0.7), radius: 6)
                Text("\(snapshot.streak)")
                    .font(.system(size: 34, weight: .semibold, design: .serif))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text("day streak")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.white.opacity(0.55))
            }
        }
    }
}

struct StreakView: View {
    @Environment(\.widgetFamily) var family
    let snapshot: TodaySnapshot

    var body: some View {
        switch family {
        case .accessoryCircular:
            Gauge(value: Double(snapshot.done), in: 0...Double(max(snapshot.total, 1))) {
                Image(systemName: "flame.fill")
            } currentValueLabel: {
                Text("\(snapshot.streak)")
            }
            .gaugeStyle(.accessoryCircular)
            .widgetURL(URL(string: "cannon://today"))

        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill")
                    Text("\(snapshot.streak) day streak").font(.headline)
                }
                Text("\(snapshot.done) of \(snapshot.total) maxes today").font(.system(size: 13))
            }
            .widgetURL(URL(string: "cannon://today"))

        case .accessoryInline:
            Label("\(snapshot.streak) day streak · \(snapshot.done)/\(snapshot.total)", systemImage: "flame.fill")
                .widgetURL(URL(string: "cannon://today"))

        default: // systemSmall — dark ink tile with the glowing ring
            VStack(spacing: 6) {
                StreakRingView(snapshot: snapshot)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                Text("\(snapshot.done) of \(snapshot.total) today")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.55))
            }
            .padding(14)
            .widgetURL(URL(string: "cannon://today"))
            .widgetSurface(inkGradient)
        }
    }
}

// MARK: - Widgets

struct MaxTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MaxTodayWidget", provider: MaxProvider()) { entry in
            TodayListView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Today")
        .description("Your maxes for today, with your streak.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct MaxStreakWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MaxStreakWidget", provider: MaxProvider()) { entry in
            StreakView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Streak")
        .description("Keep your daily streak alive.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct MaxWidgetBundle: WidgetBundle {
    var body: some Widget {
        MaxTodayWidget()
        MaxStreakWidget()
    }
}
