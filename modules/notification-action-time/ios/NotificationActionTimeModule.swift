import ExpoModulesCore
import ExpoNotifications
import UIKit
import UserNotifications

/**
 expo-notifications calls the action's completion handler as soon as it hands the
 response to JS, after which iOS may suspend the app before the reply request
 finishes. Holding a background task from the moment the action arrives keeps the
 process alive until JS calls `finish()` (or 25s pass).
 */
final class ActionBackgroundTime: NotificationDelegate {
  static let shared = ActionBackgroundTime()
  private static let actions: Set<String> = ["reply", "mark_read"]
  private static let maxSeconds: TimeInterval = 25

  private var taskId: UIBackgroundTaskIdentifier = .invalid
  private var timeout: DispatchWorkItem?
  private var registered = false

  func register() {
    onMain { [self] in
      guard !registered else { return }
      registered = true
      NotificationCenterManager.shared.addDelegate(self)
    }
  }

  func didReceive(_ response: UNNotificationResponse, completionHandler: @escaping () -> Void) -> Bool {
    if Self.actions.contains(response.actionIdentifier) {
      begin()
    }
    // Not handled: expo-notifications still delivers the response to JS.
    return false
  }

  func begin() {
    onMain { [self] in
      if taskId == .invalid {
        taskId = UIApplication.shared.beginBackgroundTask(withName: "DateTodayNotificationAction") { [weak self] in
          self?.end()
        }
      }
      timeout?.cancel()
      let item = DispatchWorkItem { [weak self] in self?.end() }
      timeout = item
      DispatchQueue.main.asyncAfter(deadline: .now() + Self.maxSeconds, execute: item)
    }
  }

  func end() {
    onMain { [self] in
      timeout?.cancel()
      timeout = nil
      if taskId != .invalid {
        UIApplication.shared.endBackgroundTask(taskId)
        taskId = .invalid
      }
    }
  }

  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }
}

public class NotificationActionTimeAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    ActionBackgroundTime.shared.register()
    return true
  }
}

public class NotificationActionTimeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NotificationActionTime")

    OnCreate {
      ActionBackgroundTime.shared.register()
    }

    Function("finish") {
      ActionBackgroundTime.shared.end()
    }
  }
}
