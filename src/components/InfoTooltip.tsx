/**
 * InfoTooltip — kleiner „i"-Icon-Trigger der eine Erklärung einblendet.
 *
 * Aus v2 portiert mit den dort gewonnenen Erkenntnissen:
 *   - Portal zu document.body (statt position:absolute), damit kein
 *     overflow:hidden Eltern-Element den Tooltip beschneidet
 *   - Edge-Detection beim Öffnen (rechts/unten knapp → links-bündig
 *     bzw. oben statt unten)
 *   - Hover (Desktop) + Click-Toggle (Mobile/Touch)
 *   - Outside-click + Tooltip-self-click separieren
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

interface Props {
  text: string;
  size?: number;
}

const TOOLTIP_MAX_WIDTH = 320;
const TOOLTIP_MIN_WIDTH = 220;
const VIEWPORT_PADDING = 8;

export default function InfoTooltip({ text, size = 12 }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Outside-click closes (auf Touch-Geräten essentiell — kein Hover-Leave)
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (tooltipRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('touchstart', onDocClick);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('touchstart', onDocClick);
    };
  }, [open]);

  // Position beim Öffnen messen — useLayoutEffect statt useEffect, damit
  // der Tooltip nicht für einen Frame an falscher Stelle aufpoppt.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const calcPos = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let top = rect.bottom + 4;
      let left = rect.left;
      const availableRight = vw - left - VIEWPORT_PADDING;
      let width = Math.min(
        TOOLTIP_MAX_WIDTH,
        Math.max(TOOLTIP_MIN_WIDTH, availableRight)
      );
      if (availableRight < TOOLTIP_MIN_WIDTH) {
        width = Math.min(TOOLTIP_MAX_WIDTH, vw - 2 * VIEWPORT_PADDING);
        left = Math.max(VIEWPORT_PADDING, vw - VIEWPORT_PADDING - width);
      }
      const estimatedHeight = 120;
      if (top + estimatedHeight > vh - VIEWPORT_PADDING) {
        const above = rect.top - 4 - estimatedHeight;
        if (above >= VIEWPORT_PADDING) {
          top = rect.top - 4 - estimatedHeight;
        } else {
          top = VIEWPORT_PADDING;
        }
      }
      setPos({ top, left, width });
    };
    calcPos();
    window.addEventListener('scroll', calcPos, true);
    window.addEventListener('resize', calcPos);
    return () => {
      window.removeEventListener('scroll', calcPos, true);
      window.removeEventListener('resize', calcPos);
    };
  }, [open]);

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        marginLeft: 4,
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Info"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size + 4,
          height: size + 4,
          padding: 0,
          margin: 0,
          background: 'transparent',
          border: 'none',
          borderRadius: '50%',
          cursor: 'help',
          color: '#877f71',
          opacity: open ? 1 : 0.6,
          transition: 'opacity 0.15s',
        }}
      >
        <Info size={size} />
      </button>
      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            ref={tooltipRef}
            role="tooltip"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxWidth: TOOLTIP_MAX_WIDTH,
              zIndex: 10000,
              padding: '10px 12px',
              background: '#25221e',
              color: '#f5f1e8',
              border: '1px solid rgba(201,169,98,0.30)',
              borderRadius: 6,
              boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
              fontSize: 12,
              lineHeight: 1.45,
              fontWeight: 400,
              letterSpacing: 0,
              textTransform: 'none',
              whiteSpace: 'normal',
            }}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}
