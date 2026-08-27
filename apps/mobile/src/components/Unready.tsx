import { Empty } from './Empty';
import { Skeleton } from './Skeleton';
import { useLanguage } from '../state/language';
import { refusalWords } from '../state/words';
import type { Query } from '../state/server';

interface Props {
  readonly query: Query<unknown>;
  readonly onRetry: () => void;
}

/**
 * The three answers that are not data.
 *
 * A screen holding a `Query` has four outcomes and only one of them is a
 * value. The other three were being written as `query.state === 'ready' ?
 * query.value : []` — one line, obviously correct, and a lie on two of the
 * three: a server that could not be reached and a server that said no both
 * render as *nothing here*.
 *
 * On the fleet screen that read "Nothing needs you", which is the app
 * reassuring somebody about a fleet it cannot see. On the dispute pack it read
 * "0% of the trip is covered by tracking", which is a statement about evidence
 * in a document written to settle an argument.
 *
 * So: render this above the content and render the content only when the query
 * is ready. It returns null when it is, so the call site stays one line.
 *
 * **Every branch has a way forward.** Loading is the only one without a
 * button, because the forward path is waiting.
 */
export function Unready({ query, onRetry }: Props) {
  const { t } = useLanguage();

  if (query.state === 'ready') return null;

  if (query.state === 'loading') {
    // A skeleton rather than a spinner: it says how much is coming, and it
    // does not move, which matters on a screen somebody is reading in a cab.
    return <Skeleton />;
  }

  if (query.state === 'unreachable') {
    return (
      <Empty
        icon="signal-off"
        title={t('cannot_reach_the_server')}
        detail={t('it_is_still_there')}
        action={{ label: t('try_again'), onPress: onRetry }}
      />
    );
  }

  return (
    <Empty
      icon="alert"
      title={t('the_server_said_no')}
      // The server's own reason, in the reader's words where the app knows the
      // code and in the server's English where it does not. See `refusalWords`.
      detail={refusalWords(
        query.failure.kind === 'refused' ? query.failure.code : null,
        query.failure.detail,
        t,
      )}
      action={{ label: t('try_again'), onPress: onRetry }}
    />
  );
}
