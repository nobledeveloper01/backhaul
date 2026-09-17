#import <BackhaulTrackingSpec/BackhaulTrackingSpec.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * A file handed to whatever the consignee uses, iOS side.
 *
 * `NativeDocumentsSpecBase` is generated from `NativeDocuments.ts`. One verb:
 * write the bytes under a name, offer the file through the activity sheet.
 */
@interface BackhaulDocuments : NativeDocumentsSpecBase <NativeDocumentsSpec>
@end

NS_ASSUME_NONNULL_END
