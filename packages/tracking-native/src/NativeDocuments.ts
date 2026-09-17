import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * A file handed to whatever the consignee uses.
 *
 * A **codegen spec**, and the smallest in this package: one verb. The
 * delivery note is written as bytes by `documentPdf()` in the domain with no
 * renderer (ADR-0024), and the app has nowhere to put a file — React
 * Native's own `Share` sends text on Android and a URL on iOS, and neither
 * is a file with a name. This writes the bytes to the app's own cache and
 * offers them through the platform's share sheet, as a file called what the
 * caller says.
 *
 * Nothing is kept. The cache is the platform's to clear, and the note's
 * source of truth is the draft the outbox holds, not the file.
 */
export interface Spec extends TurboModule {
  /**
   * Writes `base64` to a file called `fileName` and offers it to share.
   *
   * Resolves once the sheet has been shown; a dismissed sheet is not a
   * failure. Rejects only when the sheet could not open at all.
   */
  share(fileName: string, mimeType: string, base64: string, title: string): Promise<void>;
}

/** `get`, not `getEnforcing`, for the reason `NativeTracking.ts` gives. */
export default TurboModuleRegistry.get<Spec>('NativeDocuments');
