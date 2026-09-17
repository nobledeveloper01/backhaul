#import <BackhaulTrackingSpec/BackhaulTrackingSpec.h>
#import <Foundation/Foundation.h>
#import <React/RCTEventEmitter.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * The phone woken to send what it holds, iOS side.
 *
 * `NativeOutboxSpec` is generated from `NativeOutbox.ts`. An `RCTEventEmitter`
 * rather than the plain base class because this module's whole job is to
 * post one event — `outboxRefresh` — when iOS grants the refresh task, and
 * to end that task when the JavaScript side says the sweep is done.
 */
@interface BackhaulOutbox : RCTEventEmitter <NativeOutboxSpec>
@end

NS_ASSUME_NONNULL_END
