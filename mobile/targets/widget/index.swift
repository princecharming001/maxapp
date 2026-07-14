import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Shared data (written by the RN app into the App Group)

private let appGroup = "group.com.cannon.mobile"
private let snapshotKey = "todaySnapshot"
private let queueKey = "widgetToggleQueue"

struct TaskItem: Codable, Hashable {
    // `id` / `scheduleId` are optional so snapshots written by older app
    // builds (which lacked them) still decode cleanly; `color` is legacy and
    // no longer read. A task is only tappable when it carries an id.
    var id: String?
    var scheduleId: String?
    var title: String
    var time: String      // pre-formatted, e.g. "4:30p"
    var color: String?    // legacy — unused
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
        done: 2,
        total: 5,
        tasks: [
            TaskItem(id: "1", scheduleId: "s", title: "Mewing hold", time: "4:30p", color: nil, done: false),
            TaskItem(id: "2", scheduleId: "s", title: "Jaw + posture set", time: "6:00p", color: nil, done: false),
            TaskItem(id: "3", scheduleId: "s", title: "Evening lift", time: "7:15p", color: nil, done: false),
            TaskItem(id: "4", scheduleId: "s", title: "Skincare AM", time: "", color: nil, done: true),
            TaskItem(id: "5", scheduleId: "s", title: "Cold shower", time: "", color: nil, done: true),
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

// MARK: - Interactive toggle (iOS 17+)

/// One queued check/uncheck the app reconciles with the backend next time it
/// foregrounds. Written by the widget, drained by `widgetSync.ts`.
struct PendingToggle: Codable {
    let taskId: String
    let scheduleId: String
    let done: Bool
}

enum WidgetStore {
    /// Flip a task's done-state in the shared snapshot so the widget updates
    /// immediately, and enqueue the change for the app to sync to the server.
    static func toggle(id: String) {
        guard let defaults = UserDefaults(suiteName: appGroup) else { return }
        var snapshot = TodaySnapshot.load()
        guard let idx = snapshot.tasks.firstIndex(where: { $0.id == id }) else { return }

        let newDone = !snapshot.tasks[idx].done
        snapshot.tasks[idx].done = newDone
        snapshot.done = snapshot.tasks.filter { $0.done }.count

        if let data = try? JSONEncoder().encode(snapshot),
           let str = String(data: data, encoding: .utf8) {
            defaults.set(str, forKey: snapshotKey)
        }

        // Collapse any earlier pending entry for this task, then append the
        // latest intent — a rapid check/uncheck reconciles to one action.
        var queue = (try? JSONDecoder().decode(
            [PendingToggle].self,
            from: Data((defaults.string(forKey: queueKey) ?? "[]").utf8)
        )) ?? []
        queue.removeAll { $0.taskId == id }
        queue.append(PendingToggle(
            taskId: id,
            scheduleId: snapshot.tasks[idx].scheduleId ?? "",
            done: newDone
        ))
        if let qdata = try? JSONEncoder().encode(queue),
           let qstr = String(data: qdata, encoding: .utf8) {
            defaults.set(qstr, forKey: queueKey)
        }

        WidgetCenter.shared.reloadAllTimelines()
    }
}

@available(iOS 17.0, *)
struct ToggleTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle a max"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Task ID") var id: String

    init() {}
    init(id: String) { self.id = id }

    func perform() async throws -> some IntentResult {
        WidgetStore.toggle(id: id)
        return .result()
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
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Palette (mirrors the app: ink + white + a single blue accent)

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

private let ink = Color(hex: "#111113")
private let mute = Color(hex: "#9A9A9A")
private let accent = Color(hex: "#2C6BED")
private let accentOnDark = Color(hex: "#5A8CF2")

private func weekdayKicker() -> String {
    let f = DateFormatter()
    f.dateFormat = "EEEE"
    return f.string(from: Date()).uppercased()
}

// MARK: - Backgrounds

private var paperGradient: LinearGradient {
    LinearGradient(colors: [Color(hex: "#FFFFFF"), Color(hex: "#FAFAFA")],
                   startPoint: .top, endPoint: .bottom)
}

private var inkGradient: LinearGradient {
    LinearGradient(colors: [Color(hex: "#18181B"), Color(hex: "#0B0B0D")],
                   startPoint: .topLeading, endPoint: .bottomTrailing)
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

/// Uppercase tracked label — the editorial kicker.
struct Kicker: View {
    let text: String
    var onDark: Bool = false
    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold))
            .tracking(1.6)
            .foregroundColor(onDark ? .white.opacity(0.5) : mute)
            .lineLimit(1)
    }
}

/// Streak as a hairline capsule — flame + serif count, fully monochrome.
struct StreakPill: View {
    let streak: Int
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill").font(.system(size: 10, weight: .semibold)).foregroundColor(ink)
            Text("\(streak)").font(.system(size: 13, weight: .semibold, design: .serif)).foregroundColor(ink)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3.5)
        .background(Capsule().fill(Color.primary.opacity(0.05)))
        .overlay(Capsule().strokeBorder(Color.primary.opacity(0.07), lineWidth: 1))
    }
}

/// One cell per max — filled = done. Reads the day at a glance, no gradient.
struct SegmentedProgress: View {
    let done: Int
    let total: Int
    var fill: Color = ink
    var track: Color = Color.primary.opacity(0.10)

    var body: some View {
        if total > 0 && total <= 8 {
            HStack(spacing: 3) {
                ForEach(0..<total, id: \.self) { i in
                    Capsule().fill(i < done ? fill : track).frame(height: 4)
                }
            }
        } else {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(track)
                    Capsule().fill(fill).frame(
                        width: total > 0 ? max(4, geo.size.width * Double(done) / Double(total)) : 0)
                }
            }
            .frame(height: 4)
        }
    }
}

/// Things-style rounded-square checkbox, tappable via the intent (iOS 17+).
struct TaskRow: View {
    let task: TaskItem
    var compact: Bool = false

    var body: some View {
        HStack(spacing: 10) {
            checkbox
            Text(task.title)
                .font(.system(size: compact ? 12.5 : 13, weight: .medium))
                .foregroundColor(task.done ? mute : ink)
                .strikethrough(task.done, color: mute.opacity(0.6))
                .lineLimit(1)
            Spacer(minLength: 4)
            trailing
        }
        .padding(.vertical, compact ? 3 : 4)
    }

    @ViewBuilder private var checkbox: some View {
        if #available(iOS 17.0, *), let id = task.id {
            Button(intent: ToggleTaskIntent(id: id)) { checkboxShape }.buttonStyle(.plain)
        } else {
            checkboxShape
        }
    }

    private var checkboxShape: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(task.done ? accent : Color.clear)
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .strokeBorder(task.done ? Color.clear : Color.primary.opacity(0.24), lineWidth: 1.6)
            if task.done {
                Image(systemName: "checkmark").font(.system(size: 9, weight: .bold)).foregroundColor(.white)
            }
        }
        .frame(width: 19, height: 19)
        .contentShape(Rectangle())
    }

    @ViewBuilder private var trailing: some View {
        if task.done {
            Text("done").font(.system(size: 11, weight: .medium)).foregroundColor(mute)
        } else if !task.time.isEmpty {
            Text(task.time).font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundColor(mute)
        }
    }
}

/// Hairline ledger rule between rows.
private var ruleLine: some View {
    Rectangle().fill(Color.primary.opacity(0.06)).frame(height: 1)
}

// MARK: - Today list (small + medium)

struct TodayListView: View {
    @Environment(\.widgetFamily) var family
    let snapshot: TodaySnapshot

    var isMedium: Bool { family == .systemMedium }
    var visibleTasks: [TaskItem] { Array(snapshot.tasks.prefix(isMedium ? 4 : 2)) }

    var body: some View {
        VStack(alignment: .leading, spacing: isMedium ? 8 : 7) {
            HStack(alignment: .center) {
                Kicker(text: isMedium ? weekdayKicker() : "TODAY")
                Spacer()
                StreakPill(streak: snapshot.streak)
            }

            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text("\(snapshot.done)")
                    .font(.system(size: isMedium ? 24 : 22, weight: .semibold, design: .serif))
                    .foregroundColor(ink)
                Text("/ \(snapshot.total)")
                    .font(.system(size: isMedium ? 15 : 14, weight: .medium, design: .serif))
                    .foregroundColor(mute)
                Text("done")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                    .padding(.leading, 1)
            }

            SegmentedProgress(done: snapshot.done, total: snapshot.total)

            VStack(spacing: 0) {
                ForEach(Array(visibleTasks.enumerated()), id: \.element) { idx, task in
                    if idx > 0 { ruleLine }
                    TaskRow(task: task, compact: !isMedium)
                }
            }
            .padding(.top, 1)

            Spacer(minLength: 0)
        }
        .padding(isMedium ? 15 : 13)
        .widgetURL(URL(string: "cannon://today"))
        .widgetSurface(paperGradient)
    }
}

// MARK: - Streak (small dark tile + lock screen)

struct StreakTileView: View {
    let snapshot: TodaySnapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                Image(systemName: "flame.fill").font(.system(size: 11, weight: .semibold)).foregroundColor(.white.opacity(0.85))
                Kicker(text: "STREAK", onDark: true)
            }
            Spacer(minLength: 4)
            Text("\(snapshot.streak)")
                .font(.system(size: 52, weight: .semibold, design: .serif))
                .foregroundColor(.white)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
            Text("day streak")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.55))
            Spacer(minLength: 6)
            SegmentedProgress(done: snapshot.done, total: snapshot.total,
                              fill: accentOnDark, track: .white.opacity(0.14))
            Text("\(snapshot.done) of \(snapshot.total) today")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.white.opacity(0.45))
                .padding(.top, 5)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(15)
        .widgetURL(URL(string: "cannon://today"))
        .widgetSurface(inkGradient)
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

        default:
            StreakTileView(snapshot: snapshot)
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
        .description("Your maxes for today — check them off right here.")
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

// MARK: - Xcode canvas previews (compiled only for previews, never shipped)

#if DEBUG
@available(iOS 17.0, *)
#Preview("Today — medium", as: .systemMedium) { MaxTodayWidget() } timeline: {
    MaxEntry(date: Date(), snapshot: .placeholder)
}
@available(iOS 17.0, *)
#Preview("Today — small", as: .systemSmall) { MaxTodayWidget() } timeline: {
    MaxEntry(date: Date(), snapshot: .placeholder)
}
@available(iOS 17.0, *)
#Preview("Streak — small", as: .systemSmall) { MaxStreakWidget() } timeline: {
    MaxEntry(date: Date(), snapshot: .placeholder)
}
#endif
