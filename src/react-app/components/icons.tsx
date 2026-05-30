import {
  Flame, Drop, Leaf, Sparkle, Play, Check, ArrowRight,
  CaretRight, CaretLeft, X, Hand, Bell, Book, ChartBar,
  House, Person, Path, Lock, ArrowCounterClockwise,
  User, Globe, SignOut, Plus, TrashSimple, PencilSimple,
} from '@phosphor-icons/react';

interface IcoProps { s?: number; c?: string; }

type P = IcoProps | undefined;
const sz = (p: P, def = 18) => p?.s ?? def;
const cl = (p: P) => p?.c ?? 'currentColor';

export const Ico = {
  flame:   (p?: IcoProps) => <Flame   size={sz(p)}     color={cl(p)} weight="regular" />,
  drop:    (p?: IcoProps) => <Drop    size={sz(p)}     color={cl(p)} weight="regular" />,
  leaf:    (p?: IcoProps) => <Leaf    size={sz(p)}     color={cl(p)} weight="regular" />,
  spark:   (p?: IcoProps) => <Sparkle size={sz(p)}     color={cl(p)} weight="regular" />,
  play:    (p?: IcoProps) => <Play    size={sz(p, 16)} color={cl(p)} weight="fill"    />,
  check:   (p?: IcoProps) => <Check   size={sz(p, 16)} color={cl(p)} weight="bold"    />,
  arrow:   (p?: IcoProps) => <ArrowRight size={sz(p, 16)} color={cl(p)} weight="regular" />,
  chevR:   (p?: IcoProps) => <CaretRight size={sz(p, 16)} color={cl(p)} weight="regular" />,
  chevL:   (p?: IcoProps) => <CaretLeft  size={sz(p, 16)} color={cl(p)} weight="regular" />,
  close:   (p?: IcoProps) => <X       size={sz(p)}     color={cl(p)} weight="regular" />,
  hand:    (p?: IcoProps) => <Hand    size={sz(p, 22)} color={cl(p)} weight="regular" />,
  bell:    (p?: IcoProps) => <Bell    size={sz(p)}     color={cl(p)} weight="regular" />,
  book:    (p?: IcoProps) => <Book    size={sz(p)}     color={cl(p)} weight="regular" />,
  chart:   (p?: IcoProps) => <ChartBar size={sz(p)}    color={cl(p)} weight="regular" />,
  home:    (p?: IcoProps) => <House   size={sz(p, 20)} color={cl(p)} weight="regular" />,
  body:    (p?: IcoProps) => <Person  size={sz(p, 20)} color={cl(p)} weight="regular" />,
  path:    (p?: IcoProps) => <Path    size={sz(p, 20)} color={cl(p)} weight="regular" />,
  lock:    (p?: IcoProps) => <Lock    size={sz(p)}     color={cl(p)} weight="regular" />,
  refresh: (p?: IcoProps) => <ArrowCounterClockwise size={sz(p)} color={cl(p)} weight="regular" />,
  user:    (p?: IcoProps) => <User    size={sz(p, 20)} color={cl(p)} weight="regular" />,
  globe:   (p?: IcoProps) => <Globe   size={sz(p)}     color={cl(p)} weight="regular" />,
  logout:  (p?: IcoProps) => <SignOut size={sz(p)}     color={cl(p)} weight="regular" />,
  plus:    (p?: IcoProps) => <Plus    size={sz(p, 16)} color={cl(p)} weight="bold"    />,
  trash:   (p?: IcoProps) => <TrashSimple size={sz(p, 16)} color={cl(p)} weight="regular" />,
  pencil:  (p?: IcoProps) => <PencilSimple size={sz(p, 16)} color={cl(p)} weight="regular" />,
};
