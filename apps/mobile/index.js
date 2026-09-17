import { AppRegistry } from 'react-native';

import { OUTBOX_TASK } from '@backhaul/tracking-native';
import App from './src/App';
import { outboxTask } from './src/state/outbox';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

// What Android's periodic job runs when the app is not open: the same outbox
// sweep the foreground runs, with the same drafts and the same token. The
// native side only wakes it. See ADR-0023.
AppRegistry.registerHeadlessTask(OUTBOX_TASK, () => outboxTask);
