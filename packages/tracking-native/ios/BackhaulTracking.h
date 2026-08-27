#import <BackhaulTrackingSpec/BackhaulTrackingSpec.h>
#import <CoreLocation/CoreLocation.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * The capture loop, iOS side.
 *
 * `NativeTrackingSpecBase` is generated from `NativeTracking.ts`, which is why
 * a change to the contract breaks this at compile time rather than on a phone
 * in Kano.
 */
@interface BackhaulTracking : NativeTrackingSpecBase <NativeTrackingSpec, CLLocationManagerDelegate>
@end

NS_ASSUME_NONNULL_END
