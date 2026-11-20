// A panel that opens over the page: the Filters side panel and the Layers
// control. A native dialog, so a modal one keeps focus inside and everything
// behind it out of reach. Focus moves to the heading on opening and back to
// the control that opened it on closing; Escape closes it.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

interface Props {
  id: string;
  title: string;
  open: boolean;
  /** Modal panels cover the page; others sit beside the map while it stays in use. */
  modal: boolean;
  onClose: () => void;
  children: ComponentChildren;
  /** Pinned under the scrolling content. */
  footer?: ComponentChildren;
}

export default function Sheet({ id, title, open, modal, onClose, children, footer }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open) {
      if (!wasOpen.current) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      // Reopen when the kind changes (a phone turned, a window resized).
      if (d.open) d.close();
      if (modal) d.showModal();
      else d.show();
      if (!wasOpen.current) heading.current?.focus();
    } else if (wasOpen.current) {
      if (d.open) d.close();
      if (opener.current?.isConnected) opener.current.focus();
    }
    wasOpen.current = open;
  }, [open, modal]);
  return (
    <dialog
      ref={dialog}
      id={id}
      class={`sheet ${modal ? 'sheet-modal' : 'sheet-beside'}`}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !modal) {
          e.stopPropagation();
          onClose();
        }
      }}
      onClick={(e) => {
        // A press on the backdrop of a modal panel closes it.
        if (modal && e.target === dialog.current) onClose();
      }}
    >
      <div class="sheet-head">
        <h2 id={`${id}-title`} ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <button type="button" class="link" onClick={onClose}>
          Close<span class="vh"> {title}</span>
        </button>
      </div>
      <div class="sheet-body">{children}</div>
      {footer && <div class="sheet-foot">{footer}</div>}
    </dialog>
  );
}
