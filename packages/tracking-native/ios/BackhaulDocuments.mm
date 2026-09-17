#import "BackhaulDocuments.h"

#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>

/**
 * The share sheet, handed a file.
 *
 * React Native's own `Share` on iOS takes a URL and shares what it points at,
 * which for a `data:` URL is bytes with no name — Mail attaches them as
 * "Attachment", Files cannot say what they are. A file in the temporary
 * directory with a `.pdf` on the end is what every activity understands.
 * Nothing here keeps it: the temporary directory is iOS's to clear, and the
 * note's record is the draft the outbox holds. See ADR-0024.
 */
@implementation BackhaulDocuments

RCT_EXPORT_MODULE(NativeDocuments)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (void)share:(NSString *)fileName
     mimeType:(NSString *)mimeType
       base64:(NSString *)base64
        title:(NSString *)title
      resolve:(RCTPromiseResolveBlock)resolve
       reject:(RCTPromiseRejectBlock)reject
{
  NSData *bytes = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
  if (bytes == nil) {
    reject(@"E_DOCUMENTS_BYTES", @"The file's bytes were not base64.", nil);
    return;
  }

  // The name is the caller's, minus anything that would leave the folder.
  NSCharacterSet *unsafe =
      [[NSCharacterSet characterSetWithCharactersInString:
                           @"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-"]
          invertedSet];
  NSString *safeName = [[fileName componentsSeparatedByCharactersInSet:unsafe]
      componentsJoinedByString:@"_"];
  NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:safeName];
  NSError *error = nil;
  if (![bytes writeToFile:path options:NSDataWritingAtomic error:&error]) {
    reject(@"E_DOCUMENTS_WRITE", @"The file could not be written.", error);
    return;
  }

  NSURL *url = [NSURL fileURLWithPath:path];
  dispatch_async(dispatch_get_main_queue(), ^{
    UIViewController *presenter = RCTPresentedViewController();
    if (presenter == nil) {
      reject(@"E_DOCUMENTS_SHEET", @"There is nothing to show the sheet from.", nil);
      return;
    }

    UIActivityViewController *sheet =
        [[UIActivityViewController alloc] initWithActivityItems:@[ url ]
                                          applicationActivities:nil];
    sheet.title = title;
    // iPad presents this as a popover and needs an anchor; a sheet with no
    // anchor there is an exception, not a sheet.
    sheet.popoverPresentationController.sourceView = presenter.view;
    sheet.popoverPresentationController.sourceRect =
        CGRectMake(CGRectGetMidX(presenter.view.bounds), CGRectGetMaxY(presenter.view.bounds) - 1, 1, 1);

    [presenter presentViewController:sheet animated:YES completion:nil];
    resolve(nil);
  });
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeDocumentsSpecJSI>(params);
}

@end
