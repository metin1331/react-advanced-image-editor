import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Rect = { top: number; left: number; width: number; height: number };

function runSubtoolTapPulse(element: HTMLElement) {
  element.classList.remove('ie-subtool-tapped');
  void element.offsetWidth;
  element.classList.add('ie-subtool-tapped');
  window.setTimeout(() => {
    element.classList.remove('ie-subtool-tapped');
  }, 360);
}

function isMobileSidebar() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 767px)').matches
  );
}

export type SidebarToolItem = {
  id: string;
  label: string;
  enabled: boolean;
};

type Props = {
  tools: SidebarToolItem[];
  activeId: string;
  buttonClassName?: string;
  onSelect: (id: string) => void;
  renderIcon: (id: string) => ReactNode;
};

/**
 * Sidebar tool rail with the sliding hover / fade-selected backgrounds from
 * the deneme prototype — visuals (icons, labels, gold tick) stay unchanged;
 * only the chrome highlight motion is added.
 */
export function EditorSidebarTools({
  tools,
  activeId,
  buttonClassName,
  onSelect,
  renderIcon,
}: Props) {
  const selectedIdx = Math.max(
    0,
    tools.findIndex((t) => t.id === activeId)
  );
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [lastHoveredIdx, setLastHoveredIdx] = useState(selectedIdx);
  const [selectedVisible, setSelectedVisible] = useState(true);
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);
  const [hoverRect, setHoverRect] = useState<Rect | null>(null);
  const selectingRef = useRef(false);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const getRect = useCallback((index: number): Rect | null => {
    const tab = tabRefs.current[index];
    const parent = containerRef.current;
    if (!tab || !parent) return null;
    const tabRect = tab.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    return {
      top: tabRect.top - parentRect.top + parent.scrollTop,
      left: tabRect.left - parentRect.left + parent.scrollLeft,
      width: tabRect.width,
      height: tabRect.height,
    };
  }, []);

  const measure = useCallback(() => {
    setSelectedRect(getRect(selectedIdx));
    const hoverIndex = hoveredIdx !== null ? hoveredIdx : lastHoveredIdx;
    setHoverRect(getRect(hoverIndex));
  }, [getRect, selectedIdx, hoveredIdx, lastHoveredIdx]);

  useLayoutEffect(() => {
    measure();
  }, [measure, tools]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  useLayoutEffect(
    () => () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    },
    []
  );

  const handleSelect = (index: number, id: string) => {
    if (!tools[index]?.enabled) return;

    const btn = tabRefs.current[index];
    if (btn && isMobileSidebar()) {
      runSubtoolTapPulse(btn);
    }

    if (id === activeId) {
      onSelect(id);
      return;
    }

    if (selectingRef.current) return;

    selectingRef.current = true;
    setSelectedVisible(false);

    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      onSelect(id);
      requestAnimationFrame(() => {
        setSelectedVisible(true);
        selectingRef.current = false;
      });
    }, 120);
  };

  return (
    <div
      ref={containerRef}
      data-ie-part='sidebar-tools'
      className='ie-sidebar-tools'
      onMouseLeave={() => setHoveredIdx(null)}
    >
      {selectedRect && (
        <div
          className='ie-sidebar-selected-bg'
          aria-hidden
          style={{
            top: selectedRect.top,
            left: selectedRect.left,
            width: selectedRect.width,
            height: selectedRect.height,
            opacity: selectedVisible ? 1 : 0,
          }}
        />
      )}

      {hoverRect && (
        <div
          className='ie-sidebar-hover-bg'
          aria-hidden
          style={{
            top: hoverRect.top,
            left: hoverRect.left,
            width: hoverRect.width,
            height: hoverRect.height,
            opacity: hoveredIdx !== null ? 1 : 0,
          }}
        />
      )}

      {tools.map((tool, index) => (
        <button
          key={tool.id}
          ref={(el) => {
            tabRefs.current[index] = el;
          }}
          type='button'
          data-ie-part='sidebar-button'
          data-ie-tool={tool.id}
          data-ie-active={activeId === tool.id ? 'true' : undefined}
          className={buttonClassName}
          disabled={!tool.enabled}
          onMouseEnter={() => {
            setLastHoveredIdx(index);
            setHoveredIdx(index);
          }}
          onClick={() => handleSelect(index, tool.id)}
        >
          <span className='ie-sidebar-icon'>{renderIcon(tool.id)}</span>
          <span className='ie-sidebar-label'>{tool.label}</span>
        </button>
      ))}
    </div>
  );
}
