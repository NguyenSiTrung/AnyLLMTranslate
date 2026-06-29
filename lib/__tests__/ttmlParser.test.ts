import { describe, it, expect } from 'vitest';
import { parseTTML, parseTtmlTime } from '@/lib/ttmlParser';

describe('parseTtmlTime', () => {
  it('parses clock time with milliseconds', () => {
    expect(parseTtmlTime('00:00:12.340')).toBeCloseTo(12.34, 3);
    expect(parseTtmlTime('01:02:03.500')).toBeCloseTo(3723.5, 3);
  });

  it('parses tick times', () => {
    expect(parseTtmlTime('123400000t', 10_000_000)).toBeCloseTo(12.34, 3);
  });

  it('parses fractional seconds', () => {
    expect(parseTtmlTime('12.34s')).toBeCloseTo(12.34, 3);
  });
});

describe('parseTTML', () => {
  it('extracts cues from TTML paragraphs', () => {
    const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00:12.340" end="00:00:15.670">Hello there</p>
      <p begin="00:00:16.000" end="00:00:18.500">General Kenobi</p>
    </div>
  </body>
</tt>`;

    const cues = parseTTML(ttml);

    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({
      startTime: expect.closeTo(12.34, 3),
      endTime: expect.closeTo(15.67, 3),
      text: 'Hello there',
    });
    expect(cues[1].text).toBe('General Kenobi');
  });

  it('returns empty array for invalid XML', () => {
    expect(parseTTML('<broken')).toEqual([]);
    expect(parseTTML('')).toEqual([]);
  });

  it('handles line breaks inside cues', () => {
    const ttml = `<?xml version="1.0"?>
<tt xmlns="http://www.w3.org/ns/ttml">
  <body>
    <div>
      <p begin="00:00:01.000" end="00:00:03.000">Line one<br/>Line two</p>
    </div>
  </body>
</tt>`;

    const cues = parseTTML(ttml);
    expect(cues[0].text).toBe('Line one Line two');
  });
});