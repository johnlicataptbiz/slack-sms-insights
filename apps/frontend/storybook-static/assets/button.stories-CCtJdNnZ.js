import { o as qe, r as z } from './index-yRop1keA.js';
import { j as le } from './jsx-runtime-u17CrQMm.js';
function we(e, t) {
  if (typeof e == 'function') return e(t);
  e != null && (e.current = t);
}
function He(...e) {
  return (t) => {
    let o = !1;
    const r = e.map((n) => {
      const s = we(n, t);
      return !o && typeof s == 'function' && (o = !0), s;
    });
    if (o)
      return () => {
        for (let n = 0; n < r.length; n++) {
          const s = r[n];
          typeof s == 'function' ? s() : we(e[n], null);
        }
      };
  };
}
var Xe = Symbol.for('react.lazy'),
  ee = qe[' use '.trim().toString()];
function Ze(e) {
  return typeof e == 'object' && e !== null && 'then' in e;
}
function je(e) {
  return (
    e != null &&
    typeof e == 'object' &&
    '$$typeof' in e &&
    e.$$typeof === Xe &&
    '_payload' in e &&
    Ze(e._payload)
  );
}
function Je(e) {
  const t = Qe(e),
    o = z.forwardRef((r, n) => {
      let { children: s, ...a } = r;
      je(s) && typeof ee == 'function' && (s = ee(s._payload));
      const u = z.Children.toArray(s),
        c = u.find(oo);
      if (c) {
        const p = c.props.children,
          b = u.map((g) =>
            g === c
              ? z.Children.count(p) > 1
                ? z.Children.only(null)
                : z.isValidElement(p)
                  ? p.props.children
                  : null
              : g,
          );
        return le.jsx(t, {
          ...a,
          ref: n,
          children: z.isValidElement(p) ? z.cloneElement(p, void 0, b) : null,
        });
      }
      return le.jsx(t, { ...a, ref: n, children: s });
    });
  return (o.displayName = `${e}.Slot`), o;
}
var Ke = Je('Slot');
function Qe(e) {
  const t = z.forwardRef((o, r) => {
    let { children: n, ...s } = o;
    if (
      (je(n) && typeof ee == 'function' && (n = ee(n._payload)),
      z.isValidElement(n))
    ) {
      const a = to(n),
        u = ro(s, n.props);
      return (
        n.type !== z.Fragment && (u.ref = r ? He(r, a) : a),
        z.cloneElement(n, u)
      );
    }
    return z.Children.count(n) > 1 ? z.Children.only(null) : null;
  });
  return (t.displayName = `${e}.SlotClone`), t;
}
var eo = Symbol('radix.slottable');
function oo(e) {
  return (
    z.isValidElement(e) &&
    typeof e.type == 'function' &&
    '__radixId' in e.type &&
    e.type.__radixId === eo
  );
}
function ro(e, t) {
  const o = { ...t };
  for (const r in t) {
    const n = e[r],
      s = t[r];
    /^on[A-Z]/.test(r)
      ? n && s
        ? (o[r] = (...u) => {
            const c = s(...u);
            return n(...u), c;
          })
        : n && (o[r] = n)
      : r === 'style'
        ? (o[r] = { ...n, ...s })
        : r === 'className' && (o[r] = [n, s].filter(Boolean).join(' '));
  }
  return { ...e, ...o };
}
function to(e) {
  let t = Object.getOwnPropertyDescriptor(e.props, 'ref')?.get,
    o = t && 'isReactWarning' in t && t.isReactWarning;
  return o
    ? e.ref
    : ((t = Object.getOwnPropertyDescriptor(e, 'ref')?.get),
      (o = t && 'isReactWarning' in t && t.isReactWarning),
      o ? e.props.ref : e.props.ref || e.ref);
}
function Ee(e) {
  var t,
    o,
    r = '';
  if (typeof e == 'string' || typeof e == 'number') r += e;
  else if (typeof e == 'object')
    if (Array.isArray(e)) {
      var n = e.length;
      for (t = 0; t < n; t++)
        e[t] && (o = Ee(e[t])) && (r && (r += ' '), (r += o));
    } else for (o in e) e[o] && (r && (r += ' '), (r += o));
  return r;
}
function Te() {
  for (var e, t, o = 0, r = '', n = arguments.length; o < n; o++)
    (e = arguments[o]) && (t = Ee(e)) && (r && (r += ' '), (r += t));
  return r;
}
const ke = (e) => (typeof e == 'boolean' ? `${e}` : e === 0 ? '0' : e),
  ze = Te,
  no = (e, t) => (o) => {
    var r;
    if (t?.variants == null) return ze(e, o?.class, o?.className);
    const { variants: n, defaultVariants: s } = t,
      a = Object.keys(n).map((p) => {
        const b = o?.[p],
          g = s?.[p];
        if (b === null) return null;
        const x = ke(b) || ke(g);
        return n[p][x];
      }),
      u =
        o &&
        Object.entries(o).reduce((p, b) => {
          const [g, x] = b;
          return x === void 0 || (p[g] = x), p;
        }, {}),
      c =
        t == null || (r = t.compoundVariants) === null || r === void 0
          ? void 0
          : r.reduce((p, b) => {
              const { class: g, className: x, ...R } = b;
              return Object.entries(R).every((P) => {
                const [C, v] = P;
                return Array.isArray(v)
                  ? v.includes({ ...s, ...u }[C])
                  : { ...s, ...u }[C] === v;
              })
                ? [...p, g, x]
                : p;
            }, []);
    return ze(e, a, c, o?.class, o?.className);
  },
  so = (e, t) => {
    const o = new Array(e.length + t.length);
    for (let r = 0; r < e.length; r++) o[r] = e[r];
    for (let r = 0; r < t.length; r++) o[e.length + r] = t[r];
    return o;
  },
  ao = (e, t) => ({ classGroupId: e, validator: t }),
  Ve = (e = new Map(), t = null, o) => ({
    nextPart: e,
    validators: t,
    classGroupId: o,
  }),
  oe = '-',
  Ce = [],
  io = 'arbitrary..',
  lo = (e) => {
    const t = mo(e),
      { conflictingClassGroups: o, conflictingClassGroupModifiers: r } = e;
    return {
      getClassGroupId: (a) => {
        if (a.startsWith('[') && a.endsWith(']')) return co(a);
        const u = a.split(oe),
          c = u[0] === '' && u.length > 1 ? 1 : 0;
        return Me(u, c, t);
      },
      getConflictingClassGroupIds: (a, u) => {
        if (u) {
          const c = r[a],
            p = o[a];
          return c ? (p ? so(p, c) : c) : p || Ce;
        }
        return o[a] || Ce;
      },
    };
  },
  Me = (e, t, o) => {
    if (e.length - t === 0) return o.classGroupId;
    const n = e[t],
      s = o.nextPart.get(n);
    if (s) {
      const p = Me(e, t + 1, s);
      if (p) return p;
    }
    const a = o.validators;
    if (a === null) return;
    const u = t === 0 ? e.join(oe) : e.slice(t).join(oe),
      c = a.length;
    for (let p = 0; p < c; p++) {
      const b = a[p];
      if (b.validator(u)) return b.classGroupId;
    }
  },
  co = (e) =>
    e.slice(1, -1).indexOf(':') === -1
      ? void 0
      : (() => {
          const t = e.slice(1, -1),
            o = t.indexOf(':'),
            r = t.slice(0, o);
          return r ? io + r : void 0;
        })(),
  mo = (e) => {
    const { theme: t, classGroups: o } = e;
    return uo(o, t);
  },
  uo = (e, t) => {
    const o = Ve();
    for (const r in e) {
      const n = e[r];
      de(n, o, r, t);
    }
    return o;
  },
  de = (e, t, o, r) => {
    const n = e.length;
    for (let s = 0; s < n; s++) {
      const a = e[s];
      po(a, t, o, r);
    }
  },
  po = (e, t, o, r) => {
    if (typeof e == 'string') {
      fo(e, t, o);
      return;
    }
    if (typeof e == 'function') {
      bo(e, t, o, r);
      return;
    }
    go(e, t, o, r);
  },
  fo = (e, t, o) => {
    const r = e === '' ? t : Ne(t, e);
    r.classGroupId = o;
  },
  bo = (e, t, o, r) => {
    if (ho(e)) {
      de(e(r), t, o, r);
      return;
    }
    t.validators === null && (t.validators = []), t.validators.push(ao(o, e));
  },
  go = (e, t, o, r) => {
    const n = Object.entries(e),
      s = n.length;
    for (let a = 0; a < s; a++) {
      const [u, c] = n[a];
      de(c, Ne(t, u), o, r);
    }
  },
  Ne = (e, t) => {
    let o = e;
    const r = t.split(oe),
      n = r.length;
    for (let s = 0; s < n; s++) {
      const a = r[s];
      let u = o.nextPart.get(a);
      u || ((u = Ve()), o.nextPart.set(a, u)), (o = u);
    }
    return o;
  },
  ho = (e) => 'isThemeGetter' in e && e.isThemeGetter === !0,
  yo = (e) => {
    if (e < 1) return { get: () => {}, set: () => {} };
    let t = 0,
      o = Object.create(null),
      r = Object.create(null);
    const n = (s, a) => {
      (o[s] = a), t++, t > e && ((t = 0), (r = o), (o = Object.create(null)));
    };
    return {
      get(s) {
        let a = o[s];
        if (a !== void 0) return a;
        if ((a = r[s]) !== void 0) return n(s, a), a;
      },
      set(s, a) {
        s in o ? (o[s] = a) : n(s, a);
      },
    };
  },
  ce = '!',
  Se = ':',
  xo = [],
  Ae = (e, t, o, r, n) => ({
    modifiers: e,
    hasImportantModifier: t,
    baseClassName: o,
    maybePostfixModifierPosition: r,
    isExternal: n,
  }),
  vo = (e) => {
    const { prefix: t, experimentalParseClassName: o } = e;
    let r = (n) => {
      const s = [];
      let a = 0,
        u = 0,
        c = 0,
        p;
      const b = n.length;
      for (let C = 0; C < b; C++) {
        const v = n[C];
        if (a === 0 && u === 0) {
          if (v === Se) {
            s.push(n.slice(c, C)), (c = C + 1);
            continue;
          }
          if (v === '/') {
            p = C;
            continue;
          }
        }
        v === '[' ? a++ : v === ']' ? a-- : v === '(' ? u++ : v === ')' && u--;
      }
      const g = s.length === 0 ? n : n.slice(c);
      let x = g,
        R = !1;
      g.endsWith(ce)
        ? ((x = g.slice(0, -1)), (R = !0))
        : g.startsWith(ce) && ((x = g.slice(1)), (R = !0));
      const P = p && p > c ? p - c : void 0;
      return Ae(s, R, x, P);
    };
    if (t) {
      const n = t + Se,
        s = r;
      r = (a) =>
        a.startsWith(n) ? s(a.slice(n.length)) : Ae(xo, !1, a, void 0, !0);
    }
    if (o) {
      const n = r;
      r = (s) => o({ className: s, parseClassName: n });
    }
    return r;
  },
  wo = (e) => {
    const t = new Map();
    return (
      e.orderSensitiveModifiers.forEach((o, r) => {
        t.set(o, 1e6 + r);
      }),
      (o) => {
        const r = [];
        let n = [];
        for (let s = 0; s < o.length; s++) {
          const a = o[s],
            u = a[0] === '[',
            c = t.has(a);
          u || c
            ? (n.length > 0 && (n.sort(), r.push(...n), (n = [])), r.push(a))
            : n.push(a);
        }
        return n.length > 0 && (n.sort(), r.push(...n)), r;
      }
    );
  },
  ko = (e) => ({
    cache: yo(e.cacheSize),
    parseClassName: vo(e),
    sortModifiers: wo(e),
    ...lo(e),
  }),
  zo = /\s+/,
  Co = (e, t) => {
    const {
        parseClassName: o,
        getClassGroupId: r,
        getConflictingClassGroupIds: n,
        sortModifiers: s,
      } = t,
      a = [],
      u = e.trim().split(zo);
    let c = '';
    for (let p = u.length - 1; p >= 0; p -= 1) {
      const b = u[p],
        {
          isExternal: g,
          modifiers: x,
          hasImportantModifier: R,
          baseClassName: P,
          maybePostfixModifierPosition: C,
        } = o(b);
      if (g) {
        c = b + (c.length > 0 ? ' ' + c : c);
        continue;
      }
      let v = !!C,
        V = r(v ? P.substring(0, C) : P);
      if (!V) {
        if (!v) {
          c = b + (c.length > 0 ? ' ' + c : c);
          continue;
        }
        if (((V = r(P)), !V)) {
          c = b + (c.length > 0 ? ' ' + c : c);
          continue;
        }
        v = !1;
      }
      const D = x.length === 0 ? '' : x.length === 1 ? x[0] : s(x).join(':'),
        B = R ? D + ce : D,
        G = B + V;
      if (a.indexOf(G) > -1) continue;
      a.push(G);
      const L = n(V, v);
      for (let M = 0; M < L.length; ++M) {
        const F = L[M];
        a.push(B + F);
      }
      c = b + (c.length > 0 ? ' ' + c : c);
    }
    return c;
  },
  So = (...e) => {
    let t = 0,
      o,
      r,
      n = '';
    while (t < e.length)
      (o = e[t++]) && (r = Oe(o)) && (n && (n += ' '), (n += r));
    return n;
  },
  Oe = (e) => {
    if (typeof e == 'string') return e;
    let t,
      o = '';
    for (let r = 0; r < e.length; r++)
      e[r] && (t = Oe(e[r])) && (o && (o += ' '), (o += t));
    return o;
  },
  Ao = (e, ...t) => {
    let o, r, n, s;
    const a = (c) => {
        const p = t.reduce((b, g) => g(b), e());
        return (o = ko(p)), (r = o.cache.get), (n = o.cache.set), (s = u), u(c);
      },
      u = (c) => {
        const p = r(c);
        if (p) return p;
        const b = Co(c, o);
        return n(c, b), b;
      };
    return (s = a), (...c) => s(So(...c));
  },
  Ro = [],
  h = (e) => {
    const t = (o) => o[e] || Ro;
    return (t.isThemeGetter = !0), t;
  },
  _e = /^\[(?:(\w[\w-]*):)?(.+)\]$/i,
  Ge = /^\((?:(\w[\w-]*):)?(.+)\)$/i,
  Po = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,
  Io = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,
  jo =
    /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,
  Eo = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,
  To = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,
  Vo =
    /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,
  j = (e) => Po.test(e),
  f = (e) => !!e && !Number.isNaN(Number(e)),
  E = (e) => !!e && Number.isInteger(Number(e)),
  ie = (e) => e.endsWith('%') && f(e.slice(0, -1)),
  I = (e) => Io.test(e),
  Le = () => !0,
  Mo = (e) => jo.test(e) && !Eo.test(e),
  me = () => !1,
  No = (e) => To.test(e),
  Oo = (e) => Vo.test(e),
  _o = (e) => !i(e) && !l(e),
  Go = (e) => T(e, Fe, me),
  i = (e) => _e.test(e),
  O = (e) => T(e, $e, Mo),
  Re = (e) => T(e, Yo, f),
  Lo = (e) => T(e, Ue, Le),
  Wo = (e) => T(e, De, me),
  Pe = (e) => T(e, We, me),
  Bo = (e) => T(e, Be, Oo),
  Z = (e) => T(e, Ye, No),
  l = (e) => Ge.test(e),
  $ = (e) => _(e, $e),
  Fo = (e) => _(e, De),
  Ie = (e) => _(e, We),
  $o = (e) => _(e, Fe),
  Do = (e) => _(e, Be),
  J = (e) => _(e, Ye, !0),
  Uo = (e) => _(e, Ue, !0),
  T = (e, t, o) => {
    const r = _e.exec(e);
    return r ? (r[1] ? t(r[1]) : o(r[2])) : !1;
  },
  _ = (e, t, o = !1) => {
    const r = Ge.exec(e);
    return r ? (r[1] ? t(r[1]) : o) : !1;
  },
  We = (e) => e === 'position' || e === 'percentage',
  Be = (e) => e === 'image' || e === 'url',
  Fe = (e) => e === 'length' || e === 'size' || e === 'bg-size',
  $e = (e) => e === 'length',
  Yo = (e) => e === 'number',
  De = (e) => e === 'family-name',
  Ue = (e) => e === 'number' || e === 'weight',
  Ye = (e) => e === 'shadow',
  qo = () => {
    const e = h('color'),
      t = h('font'),
      o = h('text'),
      r = h('font-weight'),
      n = h('tracking'),
      s = h('leading'),
      a = h('breakpoint'),
      u = h('container'),
      c = h('spacing'),
      p = h('radius'),
      b = h('shadow'),
      g = h('inset-shadow'),
      x = h('text-shadow'),
      R = h('drop-shadow'),
      P = h('blur'),
      C = h('perspective'),
      v = h('aspect'),
      V = h('ease'),
      D = h('animate'),
      B = () => [
        'auto',
        'avoid',
        'all',
        'avoid-page',
        'page',
        'left',
        'right',
        'column',
      ],
      G = () => [
        'center',
        'top',
        'bottom',
        'left',
        'right',
        'top-left',
        'left-top',
        'top-right',
        'right-top',
        'bottom-right',
        'right-bottom',
        'bottom-left',
        'left-bottom',
      ],
      L = () => [...G(), l, i],
      M = () => ['auto', 'hidden', 'clip', 'visible', 'scroll'],
      F = () => ['auto', 'contain', 'none'],
      d = () => [l, i, c],
      S = () => [j, 'full', 'auto', ...d()],
      pe = () => [E, 'none', 'subgrid', l, i],
      fe = () => ['auto', { span: ['full', E, l, i] }, E, l, i],
      U = () => [E, 'auto', l, i],
      be = () => ['auto', 'min', 'max', 'fr', l, i],
      re = () => [
        'start',
        'end',
        'center',
        'between',
        'around',
        'evenly',
        'stretch',
        'baseline',
        'center-safe',
        'end-safe',
      ],
      W = () => [
        'start',
        'end',
        'center',
        'stretch',
        'center-safe',
        'end-safe',
      ],
      A = () => ['auto', ...d()],
      N = () => [
        j,
        'auto',
        'full',
        'dvw',
        'dvh',
        'lvw',
        'lvh',
        'svw',
        'svh',
        'min',
        'max',
        'fit',
        ...d(),
      ],
      te = () => [
        j,
        'screen',
        'full',
        'dvw',
        'lvw',
        'svw',
        'min',
        'max',
        'fit',
        ...d(),
      ],
      ne = () => [
        j,
        'screen',
        'full',
        'lh',
        'dvh',
        'lvh',
        'svh',
        'min',
        'max',
        'fit',
        ...d(),
      ],
      m = () => [e, l, i],
      ge = () => [...G(), Ie, Pe, { position: [l, i] }],
      he = () => ['no-repeat', { repeat: ['', 'x', 'y', 'space', 'round'] }],
      ye = () => ['auto', 'cover', 'contain', $o, Go, { size: [l, i] }],
      se = () => [ie, $, O],
      w = () => ['', 'none', 'full', p, l, i],
      k = () => ['', f, $, O],
      Y = () => ['solid', 'dashed', 'dotted', 'double'],
      xe = () => [
        'normal',
        'multiply',
        'screen',
        'overlay',
        'darken',
        'lighten',
        'color-dodge',
        'color-burn',
        'hard-light',
        'soft-light',
        'difference',
        'exclusion',
        'hue',
        'saturation',
        'color',
        'luminosity',
      ],
      y = () => [f, ie, Ie, Pe],
      ve = () => ['', 'none', P, l, i],
      q = () => ['none', f, l, i],
      H = () => ['none', f, l, i],
      ae = () => [f, l, i],
      X = () => [j, 'full', ...d()];
    return {
      cacheSize: 500,
      theme: {
        animate: ['spin', 'ping', 'pulse', 'bounce'],
        aspect: ['video'],
        blur: [I],
        breakpoint: [I],
        color: [Le],
        container: [I],
        'drop-shadow': [I],
        ease: ['in', 'out', 'in-out'],
        font: [_o],
        'font-weight': [
          'thin',
          'extralight',
          'light',
          'normal',
          'medium',
          'semibold',
          'bold',
          'extrabold',
          'black',
        ],
        'inset-shadow': [I],
        leading: ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose'],
        perspective: [
          'dramatic',
          'near',
          'normal',
          'midrange',
          'distant',
          'none',
        ],
        radius: [I],
        shadow: [I],
        spacing: ['px', f],
        text: [I],
        'text-shadow': [I],
        tracking: ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest'],
      },
      classGroups: {
        aspect: [{ aspect: ['auto', 'square', j, i, l, v] }],
        container: ['container'],
        columns: [{ columns: [f, i, l, u] }],
        'break-after': [{ 'break-after': B() }],
        'break-before': [{ 'break-before': B() }],
        'break-inside': [
          { 'break-inside': ['auto', 'avoid', 'avoid-page', 'avoid-column'] },
        ],
        'box-decoration': [{ 'box-decoration': ['slice', 'clone'] }],
        box: [{ box: ['border', 'content'] }],
        display: [
          'block',
          'inline-block',
          'inline',
          'flex',
          'inline-flex',
          'table',
          'inline-table',
          'table-caption',
          'table-cell',
          'table-column',
          'table-column-group',
          'table-footer-group',
          'table-header-group',
          'table-row-group',
          'table-row',
          'flow-root',
          'grid',
          'inline-grid',
          'contents',
          'list-item',
          'hidden',
        ],
        sr: ['sr-only', 'not-sr-only'],
        float: [{ float: ['right', 'left', 'none', 'start', 'end'] }],
        clear: [{ clear: ['left', 'right', 'both', 'none', 'start', 'end'] }],
        isolation: ['isolate', 'isolation-auto'],
        'object-fit': [
          { object: ['contain', 'cover', 'fill', 'none', 'scale-down'] },
        ],
        'object-position': [{ object: L() }],
        overflow: [{ overflow: M() }],
        'overflow-x': [{ 'overflow-x': M() }],
        'overflow-y': [{ 'overflow-y': M() }],
        overscroll: [{ overscroll: F() }],
        'overscroll-x': [{ 'overscroll-x': F() }],
        'overscroll-y': [{ 'overscroll-y': F() }],
        position: ['static', 'fixed', 'absolute', 'relative', 'sticky'],
        inset: [{ inset: S() }],
        'inset-x': [{ 'inset-x': S() }],
        'inset-y': [{ 'inset-y': S() }],
        start: [{ 'inset-s': S(), start: S() }],
        end: [{ 'inset-e': S(), end: S() }],
        'inset-bs': [{ 'inset-bs': S() }],
        'inset-be': [{ 'inset-be': S() }],
        top: [{ top: S() }],
        right: [{ right: S() }],
        bottom: [{ bottom: S() }],
        left: [{ left: S() }],
        visibility: ['visible', 'invisible', 'collapse'],
        z: [{ z: [E, 'auto', l, i] }],
        basis: [{ basis: [j, 'full', 'auto', u, ...d()] }],
        'flex-direction': [
          { flex: ['row', 'row-reverse', 'col', 'col-reverse'] },
        ],
        'flex-wrap': [{ flex: ['nowrap', 'wrap', 'wrap-reverse'] }],
        flex: [{ flex: [f, j, 'auto', 'initial', 'none', i] }],
        grow: [{ grow: ['', f, l, i] }],
        shrink: [{ shrink: ['', f, l, i] }],
        order: [{ order: [E, 'first', 'last', 'none', l, i] }],
        'grid-cols': [{ 'grid-cols': pe() }],
        'col-start-end': [{ col: fe() }],
        'col-start': [{ 'col-start': U() }],
        'col-end': [{ 'col-end': U() }],
        'grid-rows': [{ 'grid-rows': pe() }],
        'row-start-end': [{ row: fe() }],
        'row-start': [{ 'row-start': U() }],
        'row-end': [{ 'row-end': U() }],
        'grid-flow': [
          { 'grid-flow': ['row', 'col', 'dense', 'row-dense', 'col-dense'] },
        ],
        'auto-cols': [{ 'auto-cols': be() }],
        'auto-rows': [{ 'auto-rows': be() }],
        gap: [{ gap: d() }],
        'gap-x': [{ 'gap-x': d() }],
        'gap-y': [{ 'gap-y': d() }],
        'justify-content': [{ justify: [...re(), 'normal'] }],
        'justify-items': [{ 'justify-items': [...W(), 'normal'] }],
        'justify-self': [{ 'justify-self': ['auto', ...W()] }],
        'align-content': [{ content: ['normal', ...re()] }],
        'align-items': [{ items: [...W(), { baseline: ['', 'last'] }] }],
        'align-self': [{ self: ['auto', ...W(), { baseline: ['', 'last'] }] }],
        'place-content': [{ 'place-content': re() }],
        'place-items': [{ 'place-items': [...W(), 'baseline'] }],
        'place-self': [{ 'place-self': ['auto', ...W()] }],
        p: [{ p: d() }],
        px: [{ px: d() }],
        py: [{ py: d() }],
        ps: [{ ps: d() }],
        pe: [{ pe: d() }],
        pbs: [{ pbs: d() }],
        pbe: [{ pbe: d() }],
        pt: [{ pt: d() }],
        pr: [{ pr: d() }],
        pb: [{ pb: d() }],
        pl: [{ pl: d() }],
        m: [{ m: A() }],
        mx: [{ mx: A() }],
        my: [{ my: A() }],
        ms: [{ ms: A() }],
        me: [{ me: A() }],
        mbs: [{ mbs: A() }],
        mbe: [{ mbe: A() }],
        mt: [{ mt: A() }],
        mr: [{ mr: A() }],
        mb: [{ mb: A() }],
        ml: [{ ml: A() }],
        'space-x': [{ 'space-x': d() }],
        'space-x-reverse': ['space-x-reverse'],
        'space-y': [{ 'space-y': d() }],
        'space-y-reverse': ['space-y-reverse'],
        size: [{ size: N() }],
        'inline-size': [{ inline: ['auto', ...te()] }],
        'min-inline-size': [{ 'min-inline': ['auto', ...te()] }],
        'max-inline-size': [{ 'max-inline': ['none', ...te()] }],
        'block-size': [{ block: ['auto', ...ne()] }],
        'min-block-size': [{ 'min-block': ['auto', ...ne()] }],
        'max-block-size': [{ 'max-block': ['none', ...ne()] }],
        w: [{ w: [u, 'screen', ...N()] }],
        'min-w': [{ 'min-w': [u, 'screen', 'none', ...N()] }],
        'max-w': [
          { 'max-w': [u, 'screen', 'none', 'prose', { screen: [a] }, ...N()] },
        ],
        h: [{ h: ['screen', 'lh', ...N()] }],
        'min-h': [{ 'min-h': ['screen', 'lh', 'none', ...N()] }],
        'max-h': [{ 'max-h': ['screen', 'lh', ...N()] }],
        'font-size': [{ text: ['base', o, $, O] }],
        'font-smoothing': ['antialiased', 'subpixel-antialiased'],
        'font-style': ['italic', 'not-italic'],
        'font-weight': [{ font: [r, Uo, Lo] }],
        'font-stretch': [
          {
            'font-stretch': [
              'ultra-condensed',
              'extra-condensed',
              'condensed',
              'semi-condensed',
              'normal',
              'semi-expanded',
              'expanded',
              'extra-expanded',
              'ultra-expanded',
              ie,
              i,
            ],
          },
        ],
        'font-family': [{ font: [Fo, Wo, t] }],
        'font-features': [{ 'font-features': [i] }],
        'fvn-normal': ['normal-nums'],
        'fvn-ordinal': ['ordinal'],
        'fvn-slashed-zero': ['slashed-zero'],
        'fvn-figure': ['lining-nums', 'oldstyle-nums'],
        'fvn-spacing': ['proportional-nums', 'tabular-nums'],
        'fvn-fraction': ['diagonal-fractions', 'stacked-fractions'],
        tracking: [{ tracking: [n, l, i] }],
        'line-clamp': [{ 'line-clamp': [f, 'none', l, Re] }],
        leading: [{ leading: [s, ...d()] }],
        'list-image': [{ 'list-image': ['none', l, i] }],
        'list-style-position': [{ list: ['inside', 'outside'] }],
        'list-style-type': [{ list: ['disc', 'decimal', 'none', l, i] }],
        'text-alignment': [
          { text: ['left', 'center', 'right', 'justify', 'start', 'end'] },
        ],
        'placeholder-color': [{ placeholder: m() }],
        'text-color': [{ text: m() }],
        'text-decoration': [
          'underline',
          'overline',
          'line-through',
          'no-underline',
        ],
        'text-decoration-style': [{ decoration: [...Y(), 'wavy'] }],
        'text-decoration-thickness': [
          { decoration: [f, 'from-font', 'auto', l, O] },
        ],
        'text-decoration-color': [{ decoration: m() }],
        'underline-offset': [{ 'underline-offset': [f, 'auto', l, i] }],
        'text-transform': [
          'uppercase',
          'lowercase',
          'capitalize',
          'normal-case',
        ],
        'text-overflow': ['truncate', 'text-ellipsis', 'text-clip'],
        'text-wrap': [{ text: ['wrap', 'nowrap', 'balance', 'pretty'] }],
        indent: [{ indent: d() }],
        'vertical-align': [
          {
            align: [
              'baseline',
              'top',
              'middle',
              'bottom',
              'text-top',
              'text-bottom',
              'sub',
              'super',
              l,
              i,
            ],
          },
        ],
        whitespace: [
          {
            whitespace: [
              'normal',
              'nowrap',
              'pre',
              'pre-line',
              'pre-wrap',
              'break-spaces',
            ],
          },
        ],
        break: [{ break: ['normal', 'words', 'all', 'keep'] }],
        wrap: [{ wrap: ['break-word', 'anywhere', 'normal'] }],
        hyphens: [{ hyphens: ['none', 'manual', 'auto'] }],
        content: [{ content: ['none', l, i] }],
        'bg-attachment': [{ bg: ['fixed', 'local', 'scroll'] }],
        'bg-clip': [{ 'bg-clip': ['border', 'padding', 'content', 'text'] }],
        'bg-origin': [{ 'bg-origin': ['border', 'padding', 'content'] }],
        'bg-position': [{ bg: ge() }],
        'bg-repeat': [{ bg: he() }],
        'bg-size': [{ bg: ye() }],
        'bg-image': [
          {
            bg: [
              'none',
              {
                linear: [
                  { to: ['t', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl'] },
                  E,
                  l,
                  i,
                ],
                radial: ['', l, i],
                conic: [E, l, i],
              },
              Do,
              Bo,
            ],
          },
        ],
        'bg-color': [{ bg: m() }],
        'gradient-from-pos': [{ from: se() }],
        'gradient-via-pos': [{ via: se() }],
        'gradient-to-pos': [{ to: se() }],
        'gradient-from': [{ from: m() }],
        'gradient-via': [{ via: m() }],
        'gradient-to': [{ to: m() }],
        rounded: [{ rounded: w() }],
        'rounded-s': [{ 'rounded-s': w() }],
        'rounded-e': [{ 'rounded-e': w() }],
        'rounded-t': [{ 'rounded-t': w() }],
        'rounded-r': [{ 'rounded-r': w() }],
        'rounded-b': [{ 'rounded-b': w() }],
        'rounded-l': [{ 'rounded-l': w() }],
        'rounded-ss': [{ 'rounded-ss': w() }],
        'rounded-se': [{ 'rounded-se': w() }],
        'rounded-ee': [{ 'rounded-ee': w() }],
        'rounded-es': [{ 'rounded-es': w() }],
        'rounded-tl': [{ 'rounded-tl': w() }],
        'rounded-tr': [{ 'rounded-tr': w() }],
        'rounded-br': [{ 'rounded-br': w() }],
        'rounded-bl': [{ 'rounded-bl': w() }],
        'border-w': [{ border: k() }],
        'border-w-x': [{ 'border-x': k() }],
        'border-w-y': [{ 'border-y': k() }],
        'border-w-s': [{ 'border-s': k() }],
        'border-w-e': [{ 'border-e': k() }],
        'border-w-bs': [{ 'border-bs': k() }],
        'border-w-be': [{ 'border-be': k() }],
        'border-w-t': [{ 'border-t': k() }],
        'border-w-r': [{ 'border-r': k() }],
        'border-w-b': [{ 'border-b': k() }],
        'border-w-l': [{ 'border-l': k() }],
        'divide-x': [{ 'divide-x': k() }],
        'divide-x-reverse': ['divide-x-reverse'],
        'divide-y': [{ 'divide-y': k() }],
        'divide-y-reverse': ['divide-y-reverse'],
        'border-style': [{ border: [...Y(), 'hidden', 'none'] }],
        'divide-style': [{ divide: [...Y(), 'hidden', 'none'] }],
        'border-color': [{ border: m() }],
        'border-color-x': [{ 'border-x': m() }],
        'border-color-y': [{ 'border-y': m() }],
        'border-color-s': [{ 'border-s': m() }],
        'border-color-e': [{ 'border-e': m() }],
        'border-color-bs': [{ 'border-bs': m() }],
        'border-color-be': [{ 'border-be': m() }],
        'border-color-t': [{ 'border-t': m() }],
        'border-color-r': [{ 'border-r': m() }],
        'border-color-b': [{ 'border-b': m() }],
        'border-color-l': [{ 'border-l': m() }],
        'divide-color': [{ divide: m() }],
        'outline-style': [{ outline: [...Y(), 'none', 'hidden'] }],
        'outline-offset': [{ 'outline-offset': [f, l, i] }],
        'outline-w': [{ outline: ['', f, $, O] }],
        'outline-color': [{ outline: m() }],
        shadow: [{ shadow: ['', 'none', b, J, Z] }],
        'shadow-color': [{ shadow: m() }],
        'inset-shadow': [{ 'inset-shadow': ['none', g, J, Z] }],
        'inset-shadow-color': [{ 'inset-shadow': m() }],
        'ring-w': [{ ring: k() }],
        'ring-w-inset': ['ring-inset'],
        'ring-color': [{ ring: m() }],
        'ring-offset-w': [{ 'ring-offset': [f, O] }],
        'ring-offset-color': [{ 'ring-offset': m() }],
        'inset-ring-w': [{ 'inset-ring': k() }],
        'inset-ring-color': [{ 'inset-ring': m() }],
        'text-shadow': [{ 'text-shadow': ['none', x, J, Z] }],
        'text-shadow-color': [{ 'text-shadow': m() }],
        opacity: [{ opacity: [f, l, i] }],
        'mix-blend': [
          { 'mix-blend': [...xe(), 'plus-darker', 'plus-lighter'] },
        ],
        'bg-blend': [{ 'bg-blend': xe() }],
        'mask-clip': [
          {
            'mask-clip': [
              'border',
              'padding',
              'content',
              'fill',
              'stroke',
              'view',
            ],
          },
          'mask-no-clip',
        ],
        'mask-composite': [
          { mask: ['add', 'subtract', 'intersect', 'exclude'] },
        ],
        'mask-image-linear-pos': [{ 'mask-linear': [f] }],
        'mask-image-linear-from-pos': [{ 'mask-linear-from': y() }],
        'mask-image-linear-to-pos': [{ 'mask-linear-to': y() }],
        'mask-image-linear-from-color': [{ 'mask-linear-from': m() }],
        'mask-image-linear-to-color': [{ 'mask-linear-to': m() }],
        'mask-image-t-from-pos': [{ 'mask-t-from': y() }],
        'mask-image-t-to-pos': [{ 'mask-t-to': y() }],
        'mask-image-t-from-color': [{ 'mask-t-from': m() }],
        'mask-image-t-to-color': [{ 'mask-t-to': m() }],
        'mask-image-r-from-pos': [{ 'mask-r-from': y() }],
        'mask-image-r-to-pos': [{ 'mask-r-to': y() }],
        'mask-image-r-from-color': [{ 'mask-r-from': m() }],
        'mask-image-r-to-color': [{ 'mask-r-to': m() }],
        'mask-image-b-from-pos': [{ 'mask-b-from': y() }],
        'mask-image-b-to-pos': [{ 'mask-b-to': y() }],
        'mask-image-b-from-color': [{ 'mask-b-from': m() }],
        'mask-image-b-to-color': [{ 'mask-b-to': m() }],
        'mask-image-l-from-pos': [{ 'mask-l-from': y() }],
        'mask-image-l-to-pos': [{ 'mask-l-to': y() }],
        'mask-image-l-from-color': [{ 'mask-l-from': m() }],
        'mask-image-l-to-color': [{ 'mask-l-to': m() }],
        'mask-image-x-from-pos': [{ 'mask-x-from': y() }],
        'mask-image-x-to-pos': [{ 'mask-x-to': y() }],
        'mask-image-x-from-color': [{ 'mask-x-from': m() }],
        'mask-image-x-to-color': [{ 'mask-x-to': m() }],
        'mask-image-y-from-pos': [{ 'mask-y-from': y() }],
        'mask-image-y-to-pos': [{ 'mask-y-to': y() }],
        'mask-image-y-from-color': [{ 'mask-y-from': m() }],
        'mask-image-y-to-color': [{ 'mask-y-to': m() }],
        'mask-image-radial': [{ 'mask-radial': [l, i] }],
        'mask-image-radial-from-pos': [{ 'mask-radial-from': y() }],
        'mask-image-radial-to-pos': [{ 'mask-radial-to': y() }],
        'mask-image-radial-from-color': [{ 'mask-radial-from': m() }],
        'mask-image-radial-to-color': [{ 'mask-radial-to': m() }],
        'mask-image-radial-shape': [{ 'mask-radial': ['circle', 'ellipse'] }],
        'mask-image-radial-size': [
          {
            'mask-radial': [
              { closest: ['side', 'corner'], farthest: ['side', 'corner'] },
            ],
          },
        ],
        'mask-image-radial-pos': [{ 'mask-radial-at': G() }],
        'mask-image-conic-pos': [{ 'mask-conic': [f] }],
        'mask-image-conic-from-pos': [{ 'mask-conic-from': y() }],
        'mask-image-conic-to-pos': [{ 'mask-conic-to': y() }],
        'mask-image-conic-from-color': [{ 'mask-conic-from': m() }],
        'mask-image-conic-to-color': [{ 'mask-conic-to': m() }],
        'mask-mode': [{ mask: ['alpha', 'luminance', 'match'] }],
        'mask-origin': [
          {
            'mask-origin': [
              'border',
              'padding',
              'content',
              'fill',
              'stroke',
              'view',
            ],
          },
        ],
        'mask-position': [{ mask: ge() }],
        'mask-repeat': [{ mask: he() }],
        'mask-size': [{ mask: ye() }],
        'mask-type': [{ 'mask-type': ['alpha', 'luminance'] }],
        'mask-image': [{ mask: ['none', l, i] }],
        filter: [{ filter: ['', 'none', l, i] }],
        blur: [{ blur: ve() }],
        brightness: [{ brightness: [f, l, i] }],
        contrast: [{ contrast: [f, l, i] }],
        'drop-shadow': [{ 'drop-shadow': ['', 'none', R, J, Z] }],
        'drop-shadow-color': [{ 'drop-shadow': m() }],
        grayscale: [{ grayscale: ['', f, l, i] }],
        'hue-rotate': [{ 'hue-rotate': [f, l, i] }],
        invert: [{ invert: ['', f, l, i] }],
        saturate: [{ saturate: [f, l, i] }],
        sepia: [{ sepia: ['', f, l, i] }],
        'backdrop-filter': [{ 'backdrop-filter': ['', 'none', l, i] }],
        'backdrop-blur': [{ 'backdrop-blur': ve() }],
        'backdrop-brightness': [{ 'backdrop-brightness': [f, l, i] }],
        'backdrop-contrast': [{ 'backdrop-contrast': [f, l, i] }],
        'backdrop-grayscale': [{ 'backdrop-grayscale': ['', f, l, i] }],
        'backdrop-hue-rotate': [{ 'backdrop-hue-rotate': [f, l, i] }],
        'backdrop-invert': [{ 'backdrop-invert': ['', f, l, i] }],
        'backdrop-opacity': [{ 'backdrop-opacity': [f, l, i] }],
        'backdrop-saturate': [{ 'backdrop-saturate': [f, l, i] }],
        'backdrop-sepia': [{ 'backdrop-sepia': ['', f, l, i] }],
        'border-collapse': [{ border: ['collapse', 'separate'] }],
        'border-spacing': [{ 'border-spacing': d() }],
        'border-spacing-x': [{ 'border-spacing-x': d() }],
        'border-spacing-y': [{ 'border-spacing-y': d() }],
        'table-layout': [{ table: ['auto', 'fixed'] }],
        caption: [{ caption: ['top', 'bottom'] }],
        transition: [
          {
            transition: [
              '',
              'all',
              'colors',
              'opacity',
              'shadow',
              'transform',
              'none',
              l,
              i,
            ],
          },
        ],
        'transition-behavior': [{ transition: ['normal', 'discrete'] }],
        duration: [{ duration: [f, 'initial', l, i] }],
        ease: [{ ease: ['linear', 'initial', V, l, i] }],
        delay: [{ delay: [f, l, i] }],
        animate: [{ animate: ['none', D, l, i] }],
        backface: [{ backface: ['hidden', 'visible'] }],
        perspective: [{ perspective: [C, l, i] }],
        'perspective-origin': [{ 'perspective-origin': L() }],
        rotate: [{ rotate: q() }],
        'rotate-x': [{ 'rotate-x': q() }],
        'rotate-y': [{ 'rotate-y': q() }],
        'rotate-z': [{ 'rotate-z': q() }],
        scale: [{ scale: H() }],
        'scale-x': [{ 'scale-x': H() }],
        'scale-y': [{ 'scale-y': H() }],
        'scale-z': [{ 'scale-z': H() }],
        'scale-3d': ['scale-3d'],
        skew: [{ skew: ae() }],
        'skew-x': [{ 'skew-x': ae() }],
        'skew-y': [{ 'skew-y': ae() }],
        transform: [{ transform: [l, i, '', 'none', 'gpu', 'cpu'] }],
        'transform-origin': [{ origin: L() }],
        'transform-style': [{ transform: ['3d', 'flat'] }],
        translate: [{ translate: X() }],
        'translate-x': [{ 'translate-x': X() }],
        'translate-y': [{ 'translate-y': X() }],
        'translate-z': [{ 'translate-z': X() }],
        'translate-none': ['translate-none'],
        accent: [{ accent: m() }],
        appearance: [{ appearance: ['none', 'auto'] }],
        'caret-color': [{ caret: m() }],
        'color-scheme': [
          {
            scheme: [
              'normal',
              'dark',
              'light',
              'light-dark',
              'only-dark',
              'only-light',
            ],
          },
        ],
        cursor: [
          {
            cursor: [
              'auto',
              'default',
              'pointer',
              'wait',
              'text',
              'move',
              'help',
              'not-allowed',
              'none',
              'context-menu',
              'progress',
              'cell',
              'crosshair',
              'vertical-text',
              'alias',
              'copy',
              'no-drop',
              'grab',
              'grabbing',
              'all-scroll',
              'col-resize',
              'row-resize',
              'n-resize',
              'e-resize',
              's-resize',
              'w-resize',
              'ne-resize',
              'nw-resize',
              'se-resize',
              'sw-resize',
              'ew-resize',
              'ns-resize',
              'nesw-resize',
              'nwse-resize',
              'zoom-in',
              'zoom-out',
              l,
              i,
            ],
          },
        ],
        'field-sizing': [{ 'field-sizing': ['fixed', 'content'] }],
        'pointer-events': [{ 'pointer-events': ['auto', 'none'] }],
        resize: [{ resize: ['none', '', 'y', 'x'] }],
        'scroll-behavior': [{ scroll: ['auto', 'smooth'] }],
        'scroll-m': [{ 'scroll-m': d() }],
        'scroll-mx': [{ 'scroll-mx': d() }],
        'scroll-my': [{ 'scroll-my': d() }],
        'scroll-ms': [{ 'scroll-ms': d() }],
        'scroll-me': [{ 'scroll-me': d() }],
        'scroll-mbs': [{ 'scroll-mbs': d() }],
        'scroll-mbe': [{ 'scroll-mbe': d() }],
        'scroll-mt': [{ 'scroll-mt': d() }],
        'scroll-mr': [{ 'scroll-mr': d() }],
        'scroll-mb': [{ 'scroll-mb': d() }],
        'scroll-ml': [{ 'scroll-ml': d() }],
        'scroll-p': [{ 'scroll-p': d() }],
        'scroll-px': [{ 'scroll-px': d() }],
        'scroll-py': [{ 'scroll-py': d() }],
        'scroll-ps': [{ 'scroll-ps': d() }],
        'scroll-pe': [{ 'scroll-pe': d() }],
        'scroll-pbs': [{ 'scroll-pbs': d() }],
        'scroll-pbe': [{ 'scroll-pbe': d() }],
        'scroll-pt': [{ 'scroll-pt': d() }],
        'scroll-pr': [{ 'scroll-pr': d() }],
        'scroll-pb': [{ 'scroll-pb': d() }],
        'scroll-pl': [{ 'scroll-pl': d() }],
        'snap-align': [{ snap: ['start', 'end', 'center', 'align-none'] }],
        'snap-stop': [{ snap: ['normal', 'always'] }],
        'snap-type': [{ snap: ['none', 'x', 'y', 'both'] }],
        'snap-strictness': [{ snap: ['mandatory', 'proximity'] }],
        touch: [{ touch: ['auto', 'none', 'manipulation'] }],
        'touch-x': [{ 'touch-pan': ['x', 'left', 'right'] }],
        'touch-y': [{ 'touch-pan': ['y', 'up', 'down'] }],
        'touch-pz': ['touch-pinch-zoom'],
        select: [{ select: ['none', 'text', 'all', 'auto'] }],
        'will-change': [
          { 'will-change': ['auto', 'scroll', 'contents', 'transform', l, i] },
        ],
        fill: [{ fill: ['none', ...m()] }],
        'stroke-w': [{ stroke: [f, $, O, Re] }],
        stroke: [{ stroke: ['none', ...m()] }],
        'forced-color-adjust': [{ 'forced-color-adjust': ['auto', 'none'] }],
      },
      conflictingClassGroups: {
        overflow: ['overflow-x', 'overflow-y'],
        overscroll: ['overscroll-x', 'overscroll-y'],
        inset: [
          'inset-x',
          'inset-y',
          'inset-bs',
          'inset-be',
          'start',
          'end',
          'top',
          'right',
          'bottom',
          'left',
        ],
        'inset-x': ['right', 'left'],
        'inset-y': ['top', 'bottom'],
        flex: ['basis', 'grow', 'shrink'],
        gap: ['gap-x', 'gap-y'],
        p: ['px', 'py', 'ps', 'pe', 'pbs', 'pbe', 'pt', 'pr', 'pb', 'pl'],
        px: ['pr', 'pl'],
        py: ['pt', 'pb'],
        m: ['mx', 'my', 'ms', 'me', 'mbs', 'mbe', 'mt', 'mr', 'mb', 'ml'],
        mx: ['mr', 'ml'],
        my: ['mt', 'mb'],
        size: ['w', 'h'],
        'font-size': ['leading'],
        'fvn-normal': [
          'fvn-ordinal',
          'fvn-slashed-zero',
          'fvn-figure',
          'fvn-spacing',
          'fvn-fraction',
        ],
        'fvn-ordinal': ['fvn-normal'],
        'fvn-slashed-zero': ['fvn-normal'],
        'fvn-figure': ['fvn-normal'],
        'fvn-spacing': ['fvn-normal'],
        'fvn-fraction': ['fvn-normal'],
        'line-clamp': ['display', 'overflow'],
        rounded: [
          'rounded-s',
          'rounded-e',
          'rounded-t',
          'rounded-r',
          'rounded-b',
          'rounded-l',
          'rounded-ss',
          'rounded-se',
          'rounded-ee',
          'rounded-es',
          'rounded-tl',
          'rounded-tr',
          'rounded-br',
          'rounded-bl',
        ],
        'rounded-s': ['rounded-ss', 'rounded-es'],
        'rounded-e': ['rounded-se', 'rounded-ee'],
        'rounded-t': ['rounded-tl', 'rounded-tr'],
        'rounded-r': ['rounded-tr', 'rounded-br'],
        'rounded-b': ['rounded-br', 'rounded-bl'],
        'rounded-l': ['rounded-tl', 'rounded-bl'],
        'border-spacing': ['border-spacing-x', 'border-spacing-y'],
        'border-w': [
          'border-w-x',
          'border-w-y',
          'border-w-s',
          'border-w-e',
          'border-w-bs',
          'border-w-be',
          'border-w-t',
          'border-w-r',
          'border-w-b',
          'border-w-l',
        ],
        'border-w-x': ['border-w-r', 'border-w-l'],
        'border-w-y': ['border-w-t', 'border-w-b'],
        'border-color': [
          'border-color-x',
          'border-color-y',
          'border-color-s',
          'border-color-e',
          'border-color-bs',
          'border-color-be',
          'border-color-t',
          'border-color-r',
          'border-color-b',
          'border-color-l',
        ],
        'border-color-x': ['border-color-r', 'border-color-l'],
        'border-color-y': ['border-color-t', 'border-color-b'],
        translate: ['translate-x', 'translate-y', 'translate-none'],
        'translate-none': [
          'translate',
          'translate-x',
          'translate-y',
          'translate-z',
        ],
        'scroll-m': [
          'scroll-mx',
          'scroll-my',
          'scroll-ms',
          'scroll-me',
          'scroll-mbs',
          'scroll-mbe',
          'scroll-mt',
          'scroll-mr',
          'scroll-mb',
          'scroll-ml',
        ],
        'scroll-mx': ['scroll-mr', 'scroll-ml'],
        'scroll-my': ['scroll-mt', 'scroll-mb'],
        'scroll-p': [
          'scroll-px',
          'scroll-py',
          'scroll-ps',
          'scroll-pe',
          'scroll-pbs',
          'scroll-pbe',
          'scroll-pt',
          'scroll-pr',
          'scroll-pb',
          'scroll-pl',
        ],
        'scroll-px': ['scroll-pr', 'scroll-pl'],
        'scroll-py': ['scroll-pt', 'scroll-pb'],
        touch: ['touch-x', 'touch-y', 'touch-pz'],
        'touch-x': ['touch'],
        'touch-y': ['touch'],
        'touch-pz': ['touch'],
      },
      conflictingClassGroupModifiers: { 'font-size': ['leading'] },
      orderSensitiveModifiers: [
        '*',
        '**',
        'after',
        'backdrop',
        'before',
        'details-content',
        'file',
        'first-letter',
        'first-line',
        'marker',
        'placeholder',
        'selection',
      ],
    };
  },
  Ho = Ao(qo);
function Xo(...e) {
  return Ho(Te(e));
}
const Zo = no(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
    {
      variants: {
        variant: {
          default: 'bg-primary text-primary-foreground hover:bg-primary/90',
          destructive:
            'bg-destructive text-destructive-foreground hover:bg-destructive/90',
          outline:
            'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
          secondary:
            'bg-secondary text-secondary-foreground hover:bg-secondary/80',
          ghost: 'hover:bg-accent hover:text-accent-foreground',
          link: 'text-primary underline-offset-4 hover:underline',
        },
        size: {
          default: 'h-10 px-4 py-2',
          sm: 'h-9 rounded-md px-3',
          lg: 'h-11 rounded-md px-8',
          icon: 'h-10 w-10',
        },
      },
      defaultVariants: { variant: 'default', size: 'default' },
    },
  ),
  ue = z.forwardRef(
    ({ className: e, variant: t, size: o, asChild: r = !1, ...n }, s) => {
      const a = r ? Ke : 'button';
      return le.jsx(a, {
        className: Xo(Zo({ variant: t, size: o, className: e })),
        ref: s,
        ...n,
      });
    },
  );
ue.displayName = 'Button';
ue.__docgenInfo = {
  description: '',
  methods: [],
  displayName: 'Button',
  props: {
    asChild: {
      required: !1,
      tsType: { name: 'boolean' },
      description: '',
      defaultValue: { value: 'false', computed: !1 },
    },
  },
  composes: ['VariantProps'],
};
const Qo = { title: 'UI/Button', component: ue, tags: ['autodocs'] },
  K = {
    args: { variant: 'default', size: 'default', children: 'Primary Button' },
  },
  Q = { args: { variant: 'destructive', children: 'Danger' } };
K.parameters = {
  ...K.parameters,
  docs: {
    ...K.parameters?.docs,
    source: {
      originalSource: `{
  args: {
    variant: "default",
    size: "default",
    children: "Primary Button"
  }
}`,
      ...K.parameters?.docs?.source,
    },
  },
};
Q.parameters = {
  ...Q.parameters,
  docs: {
    ...Q.parameters?.docs,
    source: {
      originalSource: `{
  args: {
    variant: "destructive",
    children: "Danger"
  }
}`,
      ...Q.parameters?.docs?.source,
    },
  },
};
const er = ['Primary', 'Destructive'];
export {
  Q as Destructive,
  K as Primary,
  er as __namedExportsOrder,
  Qo as default,
};
