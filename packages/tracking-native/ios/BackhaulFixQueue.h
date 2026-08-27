#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/** One captured fix, as it sits in the queue. */
@interface BackhaulFix : NSObject
@property (nonatomic, copy) NSString *identifier;
@property (nonatomic, copy) NSString *tripId;
@property (nonatomic, assign) double lat;
@property (nonatomic, assign) double lon;
@property (nonatomic, assign) double accuracy;
/** Milliseconds since the epoch. */
@property (nonatomic, assign) long long at;
@property (nonatomic, assign) double speed;
@property (nonatomic, assign) double battery;
@end

/**
 * Where fixes live between capture and acknowledgement.
 *
 * SQLite, in Application Support rather than Documents: iOS backs Documents up
 * to iCloud, and a queue of position fixes is not something to leave in
 * somebody's backup. It is excluded from backup explicitly as well, because
 * the directory alone is not a guarantee.
 *
 * The queue decides nothing. Same contract as the Android side, deliberately
 * to the letter: store, hand back the oldest, delete exactly the named ids.
 */
@interface BackhaulFixQueue : NSObject

- (void)insert:(BackhaulFix *)fix;

/** The oldest `limit` rows, left where they are. */
- (NSArray<BackhaulFix *> *)peek:(NSInteger)limit;

/** Deletes exactly these ids and answers how many rows went. See ADR-0009. */
- (NSInteger)acknowledge:(NSArray<NSString *> *)identifiers;

- (NSInteger)depth;

/** Milliseconds since the epoch, or -1 when nothing has been captured. */
- (long long)lastFixAt;

@end

NS_ASSUME_NONNULL_END
