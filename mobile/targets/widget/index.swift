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
    var allDone: Bool { total > 0 && done >= total }

    /// Real "nothing here yet" state — used whenever the app hasn't written a
    /// snapshot (never signed in / opened Today). NEVER shows fake tasks.
    static let empty = TodaySnapshot(streak: 0, done: 0, total: 0, tasks: [], updatedAt: nil)

    /// Sample data — shown ONLY in the widget gallery picker, never on a
    /// placed widget (see MaxProvider.getSnapshot's isPreview branch).
    static let placeholder = TodaySnapshot(
        streak: 47,
        done: 1,
        total: 5,
        tasks: [
            TaskItem(id: "1", scheduleId: "s", title: "Mewing hold", time: "4:30p", color: nil, done: false),
            TaskItem(id: "2", scheduleId: "s", title: "Jaw + posture set", time: "6:00p", color: nil, done: false),
            TaskItem(id: "3", scheduleId: "s", title: "Evening lift", time: "7:15p", color: nil, done: false),
            TaskItem(id: "4", scheduleId: "s", title: "Skincare AM", time: "", color: nil, done: true),
            TaskItem(id: "5", scheduleId: "s", title: "Cold shower", time: "8:00p", color: nil, done: false),
        ],
        updatedAt: nil
    )

    /// The real snapshot the app last wrote, or `.empty` when there is none.
    static func load() -> TodaySnapshot {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = defaults.string(forKey: snapshotKey),
            let data = raw.data(using: .utf8),
            let decoded = try? JSONDecoder().decode(TodaySnapshot.self, from: data)
        else {
            return .empty
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

// MARK: - Timeline provider

struct MaxEntry: TimelineEntry {
    let date: Date
    let snapshot: TodaySnapshot
}

struct MaxProvider: TimelineProvider {
    func placeholder(in context: Context) -> MaxEntry {
        MaxEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (MaxEntry) -> Void) {
        // The gallery picker shows sample data; a real placed widget never does.
        let snap = context.isPreview ? TodaySnapshot.placeholder : TodaySnapshot.load()
        completion(MaxEntry(date: Date(), snapshot: snap))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MaxEntry>) -> Void) {
        let entry = MaxEntry(date: Date(), snapshot: TodaySnapshot.load())
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Palette

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
private let green = Color(hex: "#2F9E60")

/// THE one color moment: warm orange → light → cool blue. The light middle
/// keeps the two hues from muddying where they meet.
private let gradOrange = Color(hex: "#FF7A1A")
private let gradLight = Color(hex: "#F3EDF2")
private let gradBlue = Color(hex: "#2C6BED")
private let dayGradient = LinearGradient(
    colors: [gradOrange, gradLight, gradBlue],
    startPoint: .leading, endPoint: .trailing
)
private let ringGradient = LinearGradient(
    colors: [gradOrange, gradLight, gradBlue],
    startPoint: .topLeading, endPoint: .bottomTrailing
)

private func weekdayKicker() -> String {
    let f = DateFormatter()
    f.dateFormat = "EEEE"
    return f.string(from: Date()).uppercased()
}

// MARK: - Surface

private var paperGradient: LinearGradient {
    LinearGradient(colors: [Color(hex: "#FFFFFF"), Color(hex: "#FAFAFA")],
                   startPoint: .top, endPoint: .bottom)
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

/// The header divider doubles as the day's progress: a gradient fill sweeps
/// left→right across a quiet hairline. Green once the day closes.
struct ProgressRule: View {
    let progress: Double
    let allDone: Bool
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.08))
                Capsule()
                    .fill(allDone ? AnyShapeStyle(green) : AnyShapeStyle(dayGradient))
                    .frame(width: progress <= 0 ? 0 : max(4, geo.size.width * progress))
            }
        }
        .frame(height: 3)
    }
}

/// Timeline row: time gutter · node on the rail · title. The node IS the
/// checkbox (tappable on iOS 17+); the rail threads the day together. No
/// "done" label — the filled node and strikethrough carry that alone.
struct TimelineRow: View {
    let task: TaskItem
    let isFirst: Bool
    let isLast: Bool

    var body: some View {
        HStack(spacing: 11) {
            Text(task.done ? "" : task.time)
                .font(.system(size: 10.5, weight: .medium))
                .monospacedDigit()
                .foregroundColor(mute.opacity(0.9))
                .frame(width: 36, alignment: .trailing)
            VStack(spacing: 0) {
                Rectangle().fill(Color.primary.opacity(isFirst ? 0 : 0.08)).frame(width: 1)
                node
                Rectangle().fill(Color.primary.opacity(isLast ? 0 : 0.08)).frame(width: 1)
            }
            .frame(width: 26)
            Text(task.title)
                .font(.system(size: 13.5, weight: .regular))
                .foregroundColor(task.done ? mute : ink)
                .strikethrough(task.done, color: mute.opacity(0.5))
                .lineLimit(1)
            Spacer(minLength: 4)
        }
        .frame(height: 33)
    }

    @ViewBuilder private var node: some View {
        if #available(iOS 17.0, *), let id = task.id {
            Button(intent: ToggleTaskIntent(id: id)) { nodeShape }.buttonStyle(.plain)
        } else {
            nodeShape
        }
    }

    private var nodeShape: some View {
        ZStack {
            if task.done {
                Circle().fill(ink)
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
            } else {
                Circle().fill(Color(hex: "#FFFFFF"))
                Circle().strokeBorder(Color.primary.opacity(0.20), lineWidth: 1.25)
            }
        }
        .frame(width: 24, height: 24)
        .contentShape(Rectangle())
    }
}

// MARK: - Today (medium: the day rail)

struct TodayListView: View {
    let snapshot: TodaySnapshot

    // Widgets can't scroll — a fixed 3 rows never clips; the header carries
    // the rest as "+N".
    var visibleTasks: [TaskItem] { Array(snapshot.tasks.prefix(3)) }
    var moreCount: Int { max(0, snapshot.total - visibleTasks.count) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(weekdayKicker())
                    .font(.system(size: 10.5, weight: .semibold))
                    .tracking(2.2)
                    .foregroundColor(mute)
                if snapshot.total > 0 {
                    Text("\(snapshot.done)/\(snapshot.total)\(moreCount > 0 ? " · +\(moreCount)" : "")")
                        .font(.system(size: 10.5, weight: .medium))
                        .monospacedDigit()
                        .foregroundColor(mute.opacity(0.8))
                }
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text("\(snapshot.streak)")
                        .font(.system(size: 13, weight: .semibold))
                        .monospacedDigit()
                        .foregroundColor(ink)
                    Text("days")
                        .font(.system(size: 10.5, weight: .medium))
                        .foregroundColor(snapshot.allDone ? green : mute)
                }
            }
            ProgressRule(progress: snapshot.progress, allDone: snapshot.allDone)
                .padding(.top, 7)
            if visibleTasks.isEmpty {
                Spacer(minLength: 0)
                VStack(alignment: .leading, spacing: 3) {
                    Text("No maxes today")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(ink)
                    Text("Plan your day in Max to see it here.")
                        .font(.system(size: 11.5, weight: .regular))
                        .foregroundColor(mute)
                }
                Spacer(minLength: 0)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(visibleTasks.enumerated()), id: \.element) { idx, task in
                        TimelineRow(task: task, isFirst: idx == 0, isLast: idx == visibleTasks.count - 1)
                    }
                }
                .padding(.top, 5)
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .widgetURL(URL(string: "cannon://today"))
        .widgetSurface(paperGradient)
    }
}

// MARK: - Small: streak count inside the day's progress ring

struct ProgressRingView: View {
    let snapshot: TodaySnapshot
    var body: some View {
        ZStack {
            Circle().stroke(Color.primary.opacity(0.07), lineWidth: 7)
            if snapshot.progress > 0 {
                Circle()
                    .trim(from: 0, to: snapshot.progress)
                    .stroke(
                        snapshot.allDone ? AnyShapeStyle(green) : AnyShapeStyle(ringGradient),
                        style: StrokeStyle(lineWidth: 7, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
            }
            VStack(spacing: 3) {
                Text("\(snapshot.streak)")
                    .font(.system(size: 36, weight: .semibold))
                    .monospacedDigit()
                    .foregroundColor(ink)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                Text("days")
                    .font(.system(size: 11, weight: .medium))
                    .tracking(0.5)
                    .foregroundColor(snapshot.allDone ? green : mute)
            }
        }
        .padding(17)
        .widgetURL(URL(string: "cannon://today"))
        .widgetSurface(paperGradient)
    }
}

// MARK: - Widgets

/// Small = the streak ring; medium = the day rail.
struct TodayEntryView: View {
    @Environment(\.widgetFamily) var family
    let snapshot: TodaySnapshot
    var body: some View {
        if family == .systemSmall {
            ProgressRingView(snapshot: snapshot)
        } else {
            TodayListView(snapshot: snapshot)
        }
    }
}

struct MaxTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MaxTodayWidget", provider: MaxProvider()) { entry in
            TodayEntryView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Today")
        .description("Your maxes for today — check them off right here.")
        .supportedFamilies([.systemSmall, .systemMedium])
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

        default: // systemSmall — the same streak ring
            ProgressRingView(snapshot: snapshot)
        }
    }
}

struct MaxStreakWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MaxStreakWidget", provider: MaxProvider()) { entry in
            StreakView(snapshot: entry.snapshot)
        }
        .configurationDisplayName("Streak")
        .description("Your streak and today's progress at a glance.")
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
#Preview("Ring — small", as: .systemSmall) { MaxTodayWidget() } timeline: {
    MaxEntry(date: Date(), snapshot: .placeholder)
}
#endif
