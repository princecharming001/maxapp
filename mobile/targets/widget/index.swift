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
        streak: 12,
        done: 2,
        total: 5,
        tasks: [
            TaskItem(id: nil, scheduleId: nil, title: "Mewing hold", time: "4:30p", color: nil, done: false),
            TaskItem(id: nil, scheduleId: nil, title: "Jaw + posture set", time: "6:00p", color: nil, done: false),
            TaskItem(id: nil, scheduleId: nil, title: "Evening lift", time: "7:15p", color: nil, done: false),
            TaskItem(id: nil, scheduleId: nil, title: "Skincare AM", time: "", color: nil, done: true),
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
        // The app reloads timelines on every data change; this is just a
        // safety refresh so the list doesn't go stale if the app never opens.
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

private let ink = Color(hex: "#111113")        // near-black, app foreground
private let mute = Color(hex: "#9A9A9A")       // muted labels
private let accent = Color(hex: "#2C6BED")     // the app's single blue accent
private let accentOnDark = Color(hex: "#5A8CF2")

// MARK: - Backgrounds

/// Neutral off-white paper for the light Today list — matches the app canvas,
/// no warm/cream tint.
private var paperGradient: LinearGradient {
    LinearGradient(
        colors: [Color(hex: "#FFFFFF"), Color(hex: "#FAFAFA")],
        startPoint: .top, endPoint: .bottom
    )
}

/// Neutral deep-ink gradient for the streak tile (cool black, not brown).
private var inkGradient: LinearGradient {
    LinearGradient(
        colors: [Color(hex: "#17171A"), Color(hex: "#0B0B0D")],
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

/// Monochrome streak chip — hairline capsule, ink flame, serif count.
struct StreakChip: View {
    let streak: Int
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(ink)
            Text("\(streak)")
                .font(.system(size: 14, weight: .semibold, design: .serif))
                .foregroundColor(ink)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 4)
        .background(Capsule().fill(Color.primary.opacity(0.05)))
        .overlay(Capsule().strokeBorder(Color.primary.opacity(0.07), lineWidth: 1))
    }
}

/// Single-color ink progress bar — no gradient.
struct DayProgressBar: View {
    let snapshot: TodaySnapshot
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.07))
                Capsule()
                    .fill(ink)
                    .frame(width: snapshot.progress <= 0
                        ? 0
                        : max(5, geo.size.width * snapshot.progress))
            }
        }
        .frame(height: 5)
    }
}

struct TaskRow: View {
    let task: TaskItem

    var body: some View {
        HStack(spacing: 11) {
            checkbox
            Text(task.title)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(task.done ? Color(uiColor: .tertiaryLabel) : ink)
                .strikethrough(task.done, color: Color(uiColor: .quaternaryLabel))
                .lineLimit(1)
            Spacer(minLength: 4)
            trailing
        }
    }

    @ViewBuilder private var checkbox: some View {
        if #available(iOS 17.0, *), let id = task.id {
            Button(intent: ToggleTaskIntent(id: id)) { checkboxShape }
                .buttonStyle(.plain)
        } else {
            checkboxShape
        }
    }

    private var checkboxShape: some View {
        ZStack {
            if task.done {
                Circle().fill(accent)
                Image(systemName: "checkmark")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(.white)
            } else {
                Circle().strokeBorder(Color.primary.opacity(0.22), lineWidth: 1.6)
            }
        }
        .frame(width: 19, height: 19)
        .contentShape(Rectangle())
    }

    @ViewBuilder private var trailing: some View {
        if task.done {
            Text("done")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color(uiColor: .tertiaryLabel))
        } else if !task.time.isEmpty {
            Text(task.time)
                .font(.system(size: 11.5, weight: .semibold, design: .rounded))
                .foregroundColor(mute)
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
        VStack(alignment: .leading, spacing: family == .systemMedium ? 8 : 6) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 1) {
                    Text("Today")
                        .font(.system(size: family == .systemMedium ? 19 : 15, weight: .semibold, design: .serif))
                        .foregroundColor(ink)
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
                HStack(spacing: 5) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(ink.opacity(0.75))
                    Text("\(snapshot.streak) day streak")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(family == .systemMedium ? 16 : 14)
        // Tapping empty space still opens the app; the checkboxes handle their
        // own taps via the intent.
        .widgetURL(URL(string: "cannon://today"))
        .widgetSurface(paperGradient)
    }
}

// MARK: - Streak (small ink tile + lock screen)

struct StreakRingView: View {
    let snapshot: TodaySnapshot

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.10), lineWidth: 6)
            Circle()
                .trim(from: 0, to: max(0.02, snapshot.progress))
                .stroke(accentOnDark, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Image(systemName: "flame.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white.opacity(0.9))
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

        default: // systemSmall — dark ink tile with the ring
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
