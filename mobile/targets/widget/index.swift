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

// MARK: - Background helper (iOS 17 requires containerBackground)

extension View {
    @ViewBuilder
    func maxWidgetBackground() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) { Color(uiColor: .systemBackground) }
        } else {
            self.background(Color(uiColor: .systemBackground))
        }
    }
}

// MARK: - Row

struct TaskRow: View {
    let task: TaskItem
    var body: some View {
        HStack(spacing: 9) {
            Image(systemName: task.done ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 15, weight: .regular))
                .foregroundColor(task.done ? Color(uiColor: .quaternaryLabel) : Color(hex: task.color))
            Text(task.title)
                .font(.system(size: 13))
                .foregroundColor(task.done ? Color(uiColor: .tertiaryLabel) : .primary)
                .strikethrough(task.done, color: Color(uiColor: .tertiaryLabel))
                .lineLimit(1)
            Spacer(minLength: 4)
            if !task.time.isEmpty {
                Text(task.done ? "done" : task.time)
                    .font(.system(size: 12))
                    .foregroundColor(Color(uiColor: .tertiaryLabel))
            }
        }
    }
}

struct StreakChip: View {
    let streak: Int
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill").font(.system(size: 13)).foregroundColor(flame)
            Text("\(streak)")
                .font(.system(size: 18, weight: .semibold, design: .serif))
                .foregroundColor(.primary)
        }
    }
}

// MARK: - Today list (small + medium)

struct TodayListView: View {
    @Environment(\.widgetFamily) var family
    let snapshot: TodaySnapshot

    var visibleTasks: [TaskItem] {
        let cap = family == .systemMedium ? 4 : 2
        return Array(snapshot.tasks.prefix(cap))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemMedium ? 6 : 5) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Today")
                        .font(.system(size: family == .systemMedium ? 20 : 15, weight: .semibold, design: .serif))
                        .foregroundColor(.primary)
                    if family == .systemMedium {
                        Text("\(snapshot.done) of \(snapshot.total) done")
                            .font(.system(size: 12)).foregroundColor(.secondary)
                    }
                }
                Spacer()
                if family == .systemMedium {
                    StreakChip(streak: snapshot.streak)
                } else {
                    Text("\(snapshot.done)/\(snapshot.total)")
                        .font(.system(size: 12)).foregroundColor(.secondary)
                }
            }
            Divider().opacity(0.5)
            ForEach(visibleTasks, id: \.self) { TaskRow(task: $0) }
            if family == .systemSmall {
                Spacer(minLength: 0)
                HStack(spacing: 5) {
                    Image(systemName: "flame.fill").font(.system(size: 12)).foregroundColor(flame)
                    Text("\(snapshot.streak) day streak")
                        .font(.system(size: 12)).foregroundColor(.secondary)
                }
            } else {
                Spacer(minLength: 0)
            }
        }
        .padding(family == .systemMedium ? 16 : 14)
        .widgetURL(URL(string: "cannon://today"))
        .maxWidgetBackground()
    }
}

// MARK: - Streak-forward (small + lock screen)

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

        default: // systemSmall
            VStack(spacing: 2) {
                Image(systemName: "flame.fill").font(.system(size: 22)).foregroundColor(flame)
                Text("\(snapshot.streak)")
                    .font(.system(size: 52, weight: .semibold, design: .serif))
                    .foregroundColor(.primary)
                Text("day streak").font(.system(size: 12)).foregroundColor(.secondary)
                ProgressView(value: Double(snapshot.done), total: Double(max(snapshot.total, 1)))
                    .tint(.primary)
                    .frame(width: 82)
                    .padding(.top, 8)
                Text("\(snapshot.done) of \(snapshot.total) today")
                    .font(.system(size: 12)).foregroundColor(.secondary).padding(.top, 4)
            }
            .padding(16)
            .widgetURL(URL(string: "cannon://today"))
            .maxWidgetBackground()
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
