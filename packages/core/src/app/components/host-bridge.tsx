import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import { documentPathForHost, getHost, hostCan } from '../lib/host';

/**
 * Connects the viewer to a host app, when there is one: the theme follows the
 * host's, and opening another document goes through the host (a desktop host
 * opens it in its own tab). Renders nothing; with no host it does nothing.
 */
export function HostBridge() {
  const { setTheme } = useTheme();

  useEffect(() => {
    const host = getHost();
    if (!host?.theme || !hostCan(host, 'theme')) return;
    setTheme(host.theme.current().mode);
    return host.theme.onChange((theme) => setTheme(theme.mode));
  }, [setTheme]);

  useEffect(() => {
    const host = getHost();
    if (!host?.openItem || !hostCan(host, 'openItem')) return;
    const open = host.openItem.bind(host);
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }
      const anchor = (e.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== '_self')) {
        return;
      }
      if (anchor.hasAttribute('download')) return;
      const path = documentPathForHost(anchor.href, window.location.href);
      if (path && open({ path, title: anchor.textContent?.trim() || undefined }))
        e.preventDefault();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
