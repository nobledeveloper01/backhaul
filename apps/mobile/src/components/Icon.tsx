import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useColours } from '../design/theme';

/**
 * The icon set.
 *
 * Drawn here rather than pulled from a library, for two reasons that both
 * matter more than the hour it costs:
 *
 * - **No emoji, ever.** An emoji is font-dependent, renders differently on
 *   every handset in the driver segment, and cannot be themed. This product
 *   ships to Transsion devices where that difference is visible.
 * - **One stroke width, one grid.** Everything below is drawn on a 24×24 grid
 *   at 1.75 stroke with round caps. Mixed stroke weights are the single
 *   clearest tell of an interface assembled rather than designed.
 *
 * Size is a token, not a number: `sm` for inline glyphs, `md` for controls,
 * `lg` for the driver face where a glance has to land.
 */

export type IconName =
  | 'truck'
  | 'signal'
  | 'signal-off'
  | 'clock'
  | 'route'
  | 'chevron-right'
  | 'chevron-left'
  | 'alert'
  | 'check'
  | 'package'
  | 'list'
  | 'swap'
  | 'wheel'
  | 'battery'
  | 'naira'
  | 'pin'
  | 'sun'
  | 'moon'
  | 'auto'
  | 'link'
  | 'search'
  | 'filter'
  | 'message'
  | 'shield'
  | 'camera'
  | 'pen'
  | 'flag'
  | 'document'
  | 'close'
  | 'plus';

const SIZE = { sm: 16, md: 20, lg: 28 } as const;

interface Props {
  readonly name: IconName;
  readonly size?: keyof typeof SIZE;
  readonly colour?: string;
}

export function Icon({ name, size = 'md', colour }: Props) {
  const colours = useColours();
  const stroke = colour ?? colours.textSecondary;
  const px = SIZE[size];

  const common = {
    stroke,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={px} height={px} viewBox="0 0 24 24">
      {paths(name, common, stroke)}
    </Svg>
  );
}

function paths(
  name: IconName,
  common: Record<string, unknown>,
  stroke: string,
): React.ReactNode {
  switch (name) {
    case 'truck':
      return (
        <>
          <Path {...common} d="M2 7.5h11v9H2z" />
          <Path {...common} d="M13 10.5h4.2l3.3 3.2v2.8H13z" />
          <Circle {...common} cx={7} cy={17.5} r={2} />
          <Circle {...common} cx={17} cy={17.5} r={2} />
        </>
      );
    case 'signal':
      return (
        <>
          <Path {...common} d="M4.5 15a10 10 0 0 1 15 0" />
          <Path {...common} d="M8 18a5.5 5.5 0 0 1 8 0" />
          <Circle cx={12} cy={20.5} r={1.4} fill={stroke} />
        </>
      );
    case 'signal-off':
      return (
        <>
          <Path {...common} d="M4.5 15a10 10 0 0 1 6.2-3.7" />
          <Path {...common} d="M15.5 12a10 10 0 0 1 4 3" />
          <Path {...common} d="M8 18a5.5 5.5 0 0 1 3.2-1.5" />
          <Circle cx={12} cy={20.5} r={1.4} fill={stroke} />
          <Path {...common} d="M3.5 3.5l17 17" />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle {...common} cx={12} cy={12} r={8.5} />
          <Path {...common} d="M12 7.5V12l3 2" />
        </>
      );
    case 'route':
      return (
        <>
          <Circle {...common} cx={5} cy={18} r={2.5} />
          <Circle {...common} cx={19} cy={6} r={2.5} />
          <Path {...common} d="M7.5 18h5a3.5 3.5 0 0 0 0-7h-1a3.5 3.5 0 0 1 0-5h5" />
        </>
      );
    case 'chevron-right':
      return <Path {...common} d="M9.5 5.5l7 6.5-7 6.5" />;
    case 'chevron-left':
      return <Path {...common} d="M14.5 5.5l-7 6.5 7 6.5" />;
    case 'alert':
      return (
        <>
          <Path {...common} d="M12 4.5l8.5 15h-17z" />
          <Path {...common} d="M12 10v4" />
          <Circle cx={12} cy={16.8} r={1.1} fill={stroke} />
        </>
      );
    case 'check':
      return <Path {...common} d="M5 12.5l4.5 4.5L19 7.5" />;
    case 'package':
      return (
        <>
          <Path {...common} d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <Path {...common} d="M4 7.5l8 4.5 8-4.5" />
          <Path {...common} d="M12 12v9" />
        </>
      );
    case 'list':
      return (
        <>
          <Path {...common} d="M9 6.5h11M9 12h11M9 17.5h11" />
          <Circle cx={4.75} cy={6.5} r={1.3} fill={stroke} />
          <Circle cx={4.75} cy={12} r={1.3} fill={stroke} />
          <Circle cx={4.75} cy={17.5} r={1.3} fill={stroke} />
        </>
      );
    case 'swap':
      return (
        <>
          <Path {...common} d="M4 8.5h13l-3.5-3.5" />
          <Path {...common} d="M20 15.5H7l3.5 3.5" />
        </>
      );
    case 'wheel':
      return (
        <>
          <Circle {...common} cx={12} cy={12} r={8.5} />
          <Circle {...common} cx={12} cy={12} r={3} />
          <Path {...common} d="M12 3.5V9M4.6 16.2l4.8-2.7M19.4 16.2l-4.8-2.7" />
        </>
      );
    case 'battery':
      return (
        <>
          <Rect {...common} x={2.5} y={7.5} width={16} height={9} rx={2.5} />
          <Path {...common} d="M21 11v2" />
          <Rect x={5} y={10} width={5} height={4} rx={1} fill={stroke} />
        </>
      );
    case 'naira':
      return (
        <>
          <Path {...common} d="M6 19V5l12 14V5" />
          <Path {...common} d="M4 10h16M4 14h16" />
        </>
      );
    case 'pin':
      return (
        <>
          <Path {...common} d="M12 21s6.5-6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21z" />
          <Circle {...common} cx={12} cy={10.5} r={2.4} />
        </>
      );
    case 'sun':
      return (
        <>
          <Circle {...common} cx={12} cy={12} r={4} />
          <Path
            {...common}
            d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1L5.3 5.3"
          />
        </>
      );
    case 'moon':
      return <Path {...common} d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />;
    case 'link':
      return (
        <>
          <Path {...common} d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7L11.5 6.3" />
          <Path {...common} d="M14 10.5a4 4 0 0 0-5.7 0L5.5 13.3a4 4 0 0 0 5.7 5.7l1.3-1.3" />
        </>
      );
    case 'search':
      return (
        <>
          <Circle {...common} cx={11} cy={11} r={6.5} />
          <Path {...common} d="M15.8 15.8L20.5 20.5" />
        </>
      );
    case 'filter':
      return <Path {...common} d="M3.5 6h17l-6.5 7.5V20l-4-2v-4.5z" />;
    case 'message':
      return (
        <>
          <Path {...common} d="M4 5.5h16v11H9.5L5 20.5v-4H4z" />
          <Path {...common} d="M8 9.5h8M8 12.5h5" />
        </>
      );
    case 'shield':
      return (
        <>
          <Path {...common} d="M12 3l7 2.5v6c0 4.2-2.9 7.4-7 9.5-4.1-2.1-7-5.3-7-9.5v-6z" />
          <Path {...common} d="M9 12l2.2 2.2L15.5 10" />
        </>
      );
    case 'camera':
      return (
        <>
          <Path {...common} d="M3.5 8h3.2l1.4-2h7.8l1.4 2h3.2v11h-17z" />
          <Circle {...common} cx={12} cy={13} r={3.6} />
        </>
      );
    case 'pen':
      return (
        <>
          <Path {...common} d="M4 20h4l10-10-4-4L4 16z" />
          <Path {...common} d="M13.5 6.5l4 4" />
        </>
      );
    case 'flag':
      return (
        <>
          <Path {...common} d="M6 21V4" />
          <Path {...common} d="M6 4.5h11l-2 3.5 2 3.5H6z" />
        </>
      );
    case 'document':
      return (
        <>
          <Path {...common} d="M6 3h8l4 4v14H6z" />
          <Path {...common} d="M14 3v4h4" />
          <Path {...common} d="M9 12h6M9 15.5h6M9 19h3" />
        </>
      );
    case 'close':
      return <Path {...common} d="M6 6l12 12M18 6L6 18" />;
    case 'plus':
      return <Path {...common} d="M12 5v14M5 12h14" />;
    case 'auto':
      return (
        <>
          <Circle {...common} cx={12} cy={12} r={8.5} />
          {/* Half filled: the phone decides. */}
          <Path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill={stroke} />
        </>
      );
  }
}
