#import "BackhaulOutbox.h"

#import <BackgroundTasks/BackgroundTasks.h>

/**
 * The refresh task, and what little the native side knows.
 *
 * iOS has no periodic job. What it has is `BGAppRefreshTask`: registered
 * before launch finishes, submitted when there is something to send, granted
 * when iOS likes and not at all after a force-quit. When it is granted the
 * app is launched in the background if it was not running, the JavaScript
 * side comes up, the event below reaches its listener, the sweep runs, and
 * `finished` ends the task inside its window. See ADR-0023.
 *
 * Nothing here reads a draft or holds a token. The task is held in a static
 * because it can arrive before the module exists — a terminated app is
 * launched by the task itself, and the module is created only when the
 * JavaScript side first asks for it.
 */
static NSString *const kRefreshIdentifier = @"com.backhaul.outbox.refresh";
static NSString *const kRefreshEvent = @"outboxRefresh";
static NSString *const kWokenNotification = @"BackhaulOutboxWoken";

static BGAppRefreshTask *_Nullable pendingTask;

@interface BackhaulOutboxRefresh : NSObject
+ (void)finish:(BOOL)success;
+ (BOOL)pending;
+ (void)submit;
+ (void)cancel;
@end

@implementation BackhaulOutboxRefresh

/**
 * Registered at image load, which is before `didFinishLaunching` returns —
 * the deadline the API sets, and one an app delegate written in Swift and a
 * module created lazily by the bridge would both miss.
 */
+ (void)load
{
  if (@available(iOS 13.0, *)) {
    [[BGTaskScheduler sharedScheduler]
        registerForTaskWithIdentifier:kRefreshIdentifier
                           usingQueue:dispatch_get_main_queue()
                        launchHandler:^(BGTask *task) {
                          pendingTask = (BGAppRefreshTask *)task;
                          task.expirationHandler = ^{
                            // Out of time. The draft is still on disk and the
                            // next grant, or the next foreground, sends it.
                            [BackhaulOutboxRefresh finish:NO];
                          };
                          [[NSNotificationCenter defaultCenter]
                              postNotificationName:kWokenNotification
                                            object:nil];
                        }];
  }
}

+ (void)finish:(BOOL)success
{
  BGAppRefreshTask *task = pendingTask;
  pendingTask = nil;
  [task setTaskCompletedWithSuccess:success];
}

+ (BOOL)pending
{
  return pendingTask != nil;
}

/** Ask for a wake no sooner than fifteen minutes out. iOS decides the rest. */
+ (void)submit
{
  if (@available(iOS 13.0, *)) {
    BGAppRefreshTaskRequest *request =
        [[BGAppRefreshTaskRequest alloc] initWithIdentifier:kRefreshIdentifier];
    request.earliestBeginDate = [NSDate dateWithTimeIntervalSinceNow:15 * 60];
    NSError *error = nil;
    // A refused submission — the identifier missing from Info.plist, or the
    // simulator, which never grants one — is not an error the driver can act
    // on. The foreground sweep stays either way.
    [[BGTaskScheduler sharedScheduler] submitTaskRequest:request error:&error];
  }
}

+ (void)cancel
{
  if (@available(iOS 13.0, *)) {
    [[BGTaskScheduler sharedScheduler] cancelTaskRequestWithIdentifier:kRefreshIdentifier];
  }
}

@end

@implementation BackhaulOutbox {
  BOOL _listening;
}

RCT_EXPORT_MODULE(NativeOutbox)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ kRefreshEvent ];
}

/**
 * The listener arriving is the moment to deliver a task that arrived first.
 *
 * On a background launch the task is granted before any JavaScript has run;
 * by the time `useOutbox` subscribes, it is already pending. Emitting here
 * rather than only from the notification is what makes that launch send.
 */
- (void)startObserving
{
  _listening = YES;
  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(woken:)
                                               name:kWokenNotification
                                             object:nil];
  if ([BackhaulOutboxRefresh pending]) {
    [self sendEventWithName:kRefreshEvent body:nil];
  }
}

- (void)stopObserving
{
  _listening = NO;
  [[NSNotificationCenter defaultCenter] removeObserver:self name:kWokenNotification object:nil];
}

- (void)woken:(NSNotification *)notification
{
  if (_listening) {
    [self sendEventWithName:kRefreshEvent body:nil];
  }
}

#pragma mark - Spec

- (void)schedule:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [BackhaulOutboxRefresh submit];
  resolve(nil);
}

- (void)cancel:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [BackhaulOutboxRefresh cancel];
  resolve(nil);
}

- (void)finished:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [BackhaulOutboxRefresh finish:YES];
  resolve(nil);
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeOutboxSpecJSI>(params);
}

@end
