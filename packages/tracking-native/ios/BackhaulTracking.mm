#import "BackhaulTracking.h"
#import "BackhaulFixQueue.h"

#import <UIKit/UIKit.h>

/**
 * The capture loop.
 *
 * iOS has no foreground service. What it has is `allowsBackgroundLocationUpdates`
 * plus the `location` background mode, which keeps delivering fixes with the
 * app suspended — and `pausesLocationUpdatesAutomatically`, which is the single
 * setting most likely to silently break a tracking product. It is off here: iOS
 * pauses updates when it decides the device is stationary, and a stationary
 * truck's *duration* is what a demurrage claim is made of.
 *
 * Nothing here decides anything. The cadence arrives from the JavaScript side,
 * which computes it with `decide()` from `@backhaul/domain`.
 */
@implementation BackhaulTracking {
  CLLocationManager *_locations;
  BackhaulFixQueue *_queue;
  NSString *_tripId;
  NSInteger _intervalSeconds;
  BOOL _running;
  NSDate *_lastAccepted;
}

RCT_EXPORT_MODULE(NativeTracking)

- (instancetype)init
{
  if (self = [super init]) {
    _queue = [BackhaulFixQueue new];
    _tripId = @"";
    _intervalSeconds = 60;
    _running = NO;
  }
  return self;
}

/**
 * Not on the main queue.
 *
 * The default would put every call to this module on the main thread, and
 * `peek:` on a queue with a day's backlog is a SQLite read a scrolling driver
 * would feel.
 */
+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

#pragma mark - Spec

- (void)start:(NSString *)tripId
    sampleIntervalSeconds:(double)sampleIntervalSeconds
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    self->_tripId = tripId ?: @"";
    self->_intervalSeconds = MAX((NSInteger)sampleIntervalSeconds, 1);

    // Idempotent, as the contract promises: starting a trip that is already
    // running only updates the cadence. A driver who taps twice must not
    // double their battery cost.
    if (!self->_locations) {
      self->_locations = [CLLocationManager new];
      self->_locations.delegate = self;
      self->_locations.desiredAccuracy = kCLLocationAccuracyNearestTenMeters;

      // No distance filter. A parked truck must keep producing fixes, because
      // a stop with no fixes has no duration.
      self->_locations.distanceFilter = kCLDistanceFilterNone;

      // The two settings the whole thing depends on.
      self->_locations.allowsBackgroundLocationUpdates = YES;
      self->_locations.pausesLocationUpdatesAutomatically = NO;

      // The blue bar. Shown deliberately: the driver's screen promises the
      // tracking is visible and bounded, and hiding the system's own
      // indication of it would make that promise a lie.
      self->_locations.showsBackgroundLocationIndicator = YES;
    }

    [self->_locations requestWhenInUseAuthorization];
    [self->_locations startUpdatingLocation];

    // Belt and braces for the case iOS terminates the app outright: significant
    // location change relaunches it, and `start` is called again from JS.
    [self->_locations startMonitoringSignificantLocationChanges];

    self->_running = YES;
    [[NSUserDefaults standardUserDefaults] setObject:self->_tripId forKey:@"backhaul.tripId"];
    [[NSUserDefaults standardUserDefaults] setBool:YES forKey:@"backhaul.running"];

    resolve(nil);
  });
}

- (void)stop:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [self->_locations stopUpdatingLocation];
    [self->_locations stopMonitoringSignificantLocationChanges];
    self->_running = NO;
    [[NSUserDefaults standardUserDefaults] setBool:NO forKey:@"backhaul.running"];
    // Deletes nothing. The queue is evidence, not a cache.
    resolve(nil);
  });
}

- (void)setSampleInterval:(double)seconds
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  // iOS has no interval — CoreLocation delivers when it has something. The
  // cadence is honoured by *discarding* fixes that arrive sooner than the
  // policy asked for, which costs a little radio and keeps the two platforms
  // producing the same track from the same policy.
  _intervalSeconds = MAX((NSInteger)seconds, 1);
  resolve(nil);
}

- (void)status:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  BOOL authorised = NO;
  if (@available(iOS 14.0, *)) {
    CLAuthorizationStatus status = _locations ? _locations.authorizationStatus
                                              : [CLLocationManager authorizationStatus];
    authorised = status == kCLAuthorizationStatusAuthorizedAlways ||
                 status == kCLAuthorizationStatusAuthorizedWhenInUse;
  }

  resolve(@{
    @"running" : @(_running),
    @"tripId" : _tripId ?: @"",
    @"queued" : @([_queue depth]),
    @"lastFixAt" : @([_queue lastFixAt]),
    // The equivalent of Android's background restriction: Low Power Mode
    // throttles location, and a revoked authorisation stops it dead. Both
    // mean the same thing to a driver — this is not recording — so both are
    // reported the same way rather than as two states nobody can act on.
    @"restrictedByOs" : @(!authorised || [NSProcessInfo processInfo].isLowPowerModeEnabled),
  });
}

- (void)peek:(double)limit resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSArray<BackhaulFix *> *rows = [_queue peek:(NSInteger)limit];
  NSMutableArray *out = [NSMutableArray arrayWithCapacity:rows.count];

  for (BackhaulFix *fix in rows) {
    [out addObject:@{
      @"id" : fix.identifier,
      @"lat" : @(fix.lat),
      @"lon" : @(fix.lon),
      @"accuracy" : @(fix.accuracy),
      @"at" : @(fix.at),
      @"speed" : @(fix.speed),
      @"battery" : @(fix.battery),
    }];
  }

  resolve(out);
}

- (void)acknowledge:(NSArray *)ids
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject
{
  NSMutableArray<NSString *> *identifiers = [NSMutableArray array];
  for (id value in ids) {
    if ([value isKindOfClass:[NSString class]]) [identifiers addObject:value];
  }
  resolve(@([_queue acknowledge:identifiers]));
}

- (void)queueDepth:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  resolve(@([_queue depth]));
}

#pragma mark - CLLocationManagerDelegate

- (void)locationManager:(CLLocationManager *)manager
     didUpdateLocations:(NSArray<CLLocation *> *)locations
{
  if (!_running) return;

  for (CLLocation *location in locations) {
    // The cadence, enforced here because CoreLocation has no interval. A fix
    // that arrives sooner than the policy asked for is dropped rather than
    // stored: the track would otherwise be denser on iOS than on Android from
    // the same policy, and the two are held to the same answers.
    if (_lastAccepted &&
        [location.timestamp timeIntervalSinceDate:_lastAccepted] < (double)_intervalSeconds) {
      continue;
    }
    _lastAccepted = location.timestamp;

    BackhaulFix *fix = [BackhaulFix new];
    // Generated at capture and carried unchanged to the server: it is the
    // deduplication key end to end, which is what makes a retried upload
    // harmless.
    fix.identifier = [[NSUUID UUID] UUIDString];
    fix.tripId = _tripId ?: @"";
    fix.lat = location.coordinate.latitude;
    fix.lon = location.coordinate.longitude;
    fix.accuracy = location.horizontalAccuracy >= 0 ? location.horizontalAccuracy : -1;
    fix.at = (long long)([location.timestamp timeIntervalSince1970] * 1000.0);
    fix.speed = location.speed >= 0 ? location.speed : -1;
    fix.battery = [self batteryFraction];

    [_queue insert:fix];
  }
}

- (void)locationManager:(CLLocationManager *)manager didFailWithError:(NSError *)error
{
  // Deliberately silent. A transient CoreLocation error is normal on a
  // corridor with no sky; the thing that matters — whether fixes are arriving
  // at all — is answered by `lastFixAt` in `status`, which the driver's screen
  // renders as an age rather than as an error.
}

/** 0–1, or −1 when iOS will not say. Captured with the fix, not separately. */
- (double)batteryFraction
{
  UIDevice *device = [UIDevice currentDevice];
  if (!device.batteryMonitoringEnabled) device.batteryMonitoringEnabled = YES;
  return device.batteryLevel >= 0 ? device.batteryLevel : -1;
}

#pragma mark - TurboModule

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeTrackingSpecJSI>(params);
}

@end
