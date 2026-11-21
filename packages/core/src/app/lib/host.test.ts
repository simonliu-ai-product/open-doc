import { describe, expect, it } from 'vitest';
import { documentPathForHost, getHost, hostCan } from './host';

describe('documentPathForHost', () => {
  const home = 'http://localhost:5273/';
  it('hands the host a link to another document', () => {
    expect(documentPathForHost('/d/annual-report', home)).toBe('/d/annual-report');
    expect(documentPathForHost('/d/a?p=3', 'http://localhost:5273/d/b')).toBe('/d/a?p=3');
  });
  it('leaves other links, other origins and the shown document to the viewer', () => {
    expect(documentPathForHost('/themes', home)).toBeNull();
    expect(documentPathForHost('https://example.com/d/x', home)).toBeNull();
    expect(documentPathForHost('/d/a#outline', 'http://localhost:5273/d/a')).toBeNull();
  });
});

describe('getHost', () => {
  it('is undefined without a host, so the viewer behaves as in a browser', () => {
    expect(getHost()).toBeUndefined();
    expect(hostCan(undefined, 'theme')).toBe(false);
  });
});
