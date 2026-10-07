import { createPortal } from 'react-dom';
import { OverlayFrame } from '../overlay-frame';
import { elementsAtLoc } from '../page-placement';
import { Pin } from './comments-panel';
import type { DocComment } from './use-comments';

/**
 * Each comment's number pinned at the top right of the element it is about,
 * and the element outlined while its comment is the one selected.
 */
export function CommentsOverlay({
  container,
  comments,
  activeId,
}: {
  container: HTMLElement;
  comments: DocComment[];
  activeId: string | null;
}) {
  return createPortal(
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      {comments.flatMap((comment, at) =>
        comment.loc
          ? elementsAtLoc(container, comment.loc).map((el, copy) => (
              <OverlayFrame
                // biome-ignore lint/suspicious/noArrayIndexKey: one loc can print more than once
                key={`${comment.id}:${copy}`}
                anchor={el}
                container={container}
                style={
                  comment.id === activeId
                    ? {
                        outline: '2px solid var(--comment-pin)',
                        outlineOffset: 3,
                        background: 'color-mix(in oklch, var(--comment-pin) 8%, transparent)',
                      }
                    : {}
                }
              >
                <span className="absolute -top-2.5 -right-2.5">
                  <Pin n={at + 1} active={comment.id === activeId} />
                </span>
              </OverlayFrame>
            ))
          : [],
      )}
    </div>,
    container,
  );
}
